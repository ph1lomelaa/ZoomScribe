import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from access import is_admin, owned_note, owned_session
from auth import current_manager
from database import get_db, get_db_session, now_iso
from db_models import ManagerRecord, NoteQuestionRecord, NoteRecord, SessionRecord, TranscriptRecord
from models import AskNoteRequest, NoteQuestion, NoteWithSession
from services.claude import answer_from_transcript, stream_final_note, stream_periodic_summary


router = APIRouter(tags=["notes"])

NOTE_QUESTION_RATE_LIMIT = int(os.getenv("NOTE_QUESTION_RATE_LIMIT", "20"))
NOTE_QUESTION_RATE_WINDOW_SECONDS = int(os.getenv("NOTE_QUESTION_RATE_WINDOW_SECONDS", "60"))


async def _enforce_question_rate_limit(db, manager_id: int) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=NOTE_QUESTION_RATE_WINDOW_SECONDS)).isoformat()
    recent_count = await db.scalar(
        select(func.count(NoteQuestionRecord.id)).where(
            NoteQuestionRecord.manager_id == manager_id,
            NoteQuestionRecord.created_at > cutoff,
        )
    )
    if (recent_count or 0) >= NOTE_QUESTION_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Слишком много вопросов подряд. Подождите минуту и попробуйте снова.",
        )


def format_duration(seconds: int) -> str:
    minutes = seconds // 60
    if minutes < 1:
        return f"{seconds} сек"
    if minutes < 60:
        return f"{minutes} мин"
    return f"{minutes // 60}ч {minutes % 60}мин"


def format_date(value: str) -> str:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except ValueError:
        return value


def note_view(note: NoteRecord, session: SessionRecord) -> NoteWithSession:
    return NoteWithSession(
        id=note.id,
        session_id=note.session_id,
        summary_markdown=note.summary_markdown,
        created_at=note.created_at,
        student_name=session.student_name,
        manager_name=session.manager_name,
        country=session.country,
        country_flag=session.country_flag or "",
        call_description=session.zoom_link or "",
        started_at=session.started_at,
        duration_seconds=session.duration_seconds or 0,
    )


@router.post("/api/sessions/{session_id}/notes/generate")
async def generate_note(
    session_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    result = await db.execute(
        select(TranscriptRecord)
        .where(TranscriptRecord.session_id == session_id)
        .order_by(TranscriptRecord.sequence_no.asc().nullslast(), TranscriptRecord.id.asc())
    )
    transcript_rows = list(result.scalars())
    transcript = "\n".join(
        f"[{row.speaker}]: {row.text}" if row.speaker else row.text
        for row in transcript_rows
    )
    session_data = {
        "student_name": session.student_name,
        "manager_name": session.manager_name,
        "country": session.country,
        "call_description": session.zoom_link or "",
        "date": format_date(session.started_at),
        "duration": format_duration(session.duration_seconds or 0),
    }

    collected: list[str] = []

    async def generate():
        async for chunk in stream_final_note(transcript=transcript, **session_data):
            collected.append(chunk)
            yield chunk

        # The request-scoped `db` dependency above is already torn down by the
        # time this generator runs (FastAPI closes yield-dependencies as soon as
        # the route function returns the StreamingResponse, not after the body
        # finishes streaming), so saving the result needs its own session.
        full_text = "".join(collected)
        db2 = await get_db()
        try:
            note = await db2.scalar(select(NoteRecord).where(NoteRecord.session_id == session_id))
            if note:
                note.summary_markdown = full_text
                note.created_at = now_iso()
            else:
                db2.add(NoteRecord(
                    session_id=session_id,
                    summary_markdown=full_text,
                    created_at=now_iso(),
                ))
            await db2.commit()
        finally:
            await db2.close()

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@router.post("/api/sessions/{session_id}/summaries/stream")
async def generate_live_summary(
    session_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    result = await db.execute(
        select(TranscriptRecord)
        .where(TranscriptRecord.session_id == session_id)
        .order_by(TranscriptRecord.sequence_no.asc().nullslast(), TranscriptRecord.id.asc())
    )
    transcript = "\n".join(
        f"[{row.speaker}]: {row.text}" if row.speaker else row.text
        for row in result.scalars()
    )

    return StreamingResponse(
        stream_periodic_summary(transcript),
        media_type="text/plain; charset=utf-8",
    )


@router.get("/api/notes", response_model=list[NoteWithSession])
async def list_notes(
    manager_id: int | None = None,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    query = select(NoteRecord, SessionRecord).join(SessionRecord, SessionRecord.id == NoteRecord.session_id)
    if is_admin(manager):
        if manager_id is not None:
            query = query.where(SessionRecord.manager_id == manager_id)
    else:
        query = query.where(SessionRecord.manager_id == manager.id)
    result = await db.execute(
        query.order_by(NoteRecord.created_at.desc())
    )
    return [note_view(note, session) for note, session in result.all()]


@router.get("/api/notes/{note_id}", response_model=NoteWithSession)
async def get_note(
    note_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    note, session = await owned_note(db, note_id, manager)
    return note_view(note, session)


@router.post("/api/notes/{note_id}/questions", response_model=NoteQuestion)
async def ask_note(
    note_id: int,
    body: AskNoteRequest,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    note, session = await owned_note(db, note_id, manager)
    await _enforce_question_rate_limit(db, manager.id)
    result = await db.execute(
        select(TranscriptRecord)
        .where(TranscriptRecord.session_id == session.id)
        .order_by(TranscriptRecord.sequence_no.asc().nullslast(), TranscriptRecord.id.asc())
    )
    transcript = "\n".join(
        f"[{row.speaker}]: {row.text}" if row.speaker else row.text
        for row in result.scalars()
    )
    answer = await answer_from_transcript(body.question, transcript, note.summary_markdown)
    item = NoteQuestionRecord(
        note_id=note.id,
        manager_id=manager.id,
        question=body.question.strip(),
        answer=answer,
        created_at=now_iso(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return NoteQuestion(
        id=item.id, note_id=item.note_id, question=item.question,
        answer=item.answer, created_at=item.created_at,
    )


@router.get("/api/notes/{note_id}/questions", response_model=list[NoteQuestion])
async def list_questions(
    note_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    note, session = await owned_note(db, note_id, manager)
    manager_filter = None if is_admin(manager) else manager.id
    query = select(NoteQuestionRecord).where(NoteQuestionRecord.note_id == note_id)
    if manager_filter is not None:
        query = query.where(NoteQuestionRecord.manager_id == manager_filter)
    result = await db.execute(
        query.order_by(NoteQuestionRecord.created_at.asc())
    )
    return [
        NoteQuestion(
            id=item.id, note_id=item.note_id, question=item.question,
            answer=item.answer, created_at=item.created_at,
        )
        for item in result.scalars()
    ]
