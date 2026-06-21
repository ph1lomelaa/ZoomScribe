import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from access import is_admin, mark_stale_sessions, owned_session
from auth import current_manager
from database import get_db_session, now_iso
from db_models import (
    ManagerRecord, NoteQuestionRecord, NoteRecord, SessionRecord, TranscriptRecord,
)
from models import (
    Session, SessionCreate, SessionDetail, SessionEndRequest, SessionWithNote,
    Transcript, TranscriptCreate,
)


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def strip_markdown(value: str, limit: int = 200) -> str:
    value = re.sub(r"#+ ", "", value)
    value = re.sub(r"\*\*(.+?)\*\*", r"\1", value)
    value = re.sub(r"\*(.+?)\*", r"\1", value)
    value = re.sub(r"- ", "", value)
    return re.sub(r"\n+", " ", value).strip()[:limit]


def session_dict(row: SessionRecord) -> dict:
    return {
        "id": row.id,
        "student_name": row.student_name,
        "manager_name": row.manager_name,
        "country": row.country,
        "country_flag": row.country_flag or "",
        "zoom_link": row.zoom_link or "",
        "started_at": row.started_at,
        "ended_at": row.ended_at,
        "duration_seconds": row.duration_seconds or 0,
        "status": row.status,
        "last_heartbeat_at": row.last_heartbeat_at,
    }


def transcript_dict(row: TranscriptRecord) -> dict:
    return {
        "id": row.id,
        "session_id": row.session_id,
        "text": row.text,
        "timestamp": row.timestamp,
        "speaker": row.speaker,
        "client_segment_id": row.client_segment_id,
        "sequence_no": row.sequence_no,
    }


@router.post("", response_model=Session, status_code=201)
async def create_session(
    body: SessionCreate,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    row = SessionRecord(
        manager_id=manager.id,
        student_name=body.student_name.strip(),
        manager_name=manager.full_name,
        country=body.country.strip(),
        country_flag=body.country_flag.strip(),
        zoom_link=body.zoom_link.strip(),
        started_at=now_iso(),
        status="active",
        last_heartbeat_at=now_iso(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return Session(**session_dict(row))


@router.get("", response_model=list[SessionWithNote])
async def list_sessions(
    manager_id: int | None = None,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    query = select(SessionRecord, NoteRecord).outerjoin(NoteRecord, NoteRecord.session_id == SessionRecord.id)
    if is_admin(manager):
        # No manager_id -> "Все" (every manager's sessions, the existing
        # default). A manager_id narrows to just that one manager — including
        # the admin's own id for "Свои", since that's just a normal filter value.
        if manager_id is not None:
            query = query.where(SessionRecord.manager_id == manager_id)
    else:
        # A non-admin can never see anyone else's sessions: whatever manager_id
        # they pass (their own, someone else's, garbage) is ignored outright.
        query = query.where(SessionRecord.manager_id == manager.id)
    result = await db.execute(
        query.order_by(SessionRecord.started_at.desc())
    )
    rows = result.all()
    await mark_stale_sessions(db, [session for session, _ in rows])
    return [
        SessionWithNote(
            **session_dict(session),
            note_preview=strip_markdown(note.summary_markdown) if note else None,
            note_id=note.id if note else None,
        )
        for session, note in rows
    ]


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    await mark_stale_sessions(db, [session])
    transcript_result = await db.execute(
        select(TranscriptRecord)
        .where(TranscriptRecord.session_id == session_id)
        .order_by(TranscriptRecord.sequence_no.asc().nullslast(), TranscriptRecord.id.asc())
    )
    transcripts = [Transcript(**transcript_dict(row)) for row in transcript_result.scalars()]
    note_row = await db.scalar(select(NoteRecord).where(NoteRecord.session_id == session_id))
    note = None
    if note_row:
        note = {
            "id": note_row.id,
            "session_id": note_row.session_id,
            "summary_markdown": note_row.summary_markdown,
            "created_at": note_row.created_at,
        }
    return SessionDetail(**session_dict(session), transcripts=transcripts, note=note)


@router.post("/{session_id}/heartbeat", status_code=204)
async def heartbeat(
    session_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    if session.status == "active":
        session.last_heartbeat_at = now_iso()
        await db.commit()


@router.patch("/{session_id}/end", response_model=Session)
async def end_session(
    session_id: int,
    body: SessionEndRequest,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    session.status = "completed"
    session.ended_at = now_iso()
    session.duration_seconds = body.duration_seconds
    session.last_heartbeat_at = now_iso()
    await db.commit()
    return Session(**session_dict(session))


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    await owned_session(db, session_id, manager)
    note_ids = select(NoteRecord.id).where(NoteRecord.session_id == session_id)
    await db.execute(delete(NoteQuestionRecord).where(NoteQuestionRecord.note_id.in_(note_ids)))
    await db.execute(delete(TranscriptRecord).where(TranscriptRecord.session_id == session_id))
    await db.execute(delete(NoteRecord).where(NoteRecord.session_id == session_id))
    await db.execute(delete(SessionRecord).where(SessionRecord.id == session_id))
    await db.commit()
    return {"ok": True}


MAX_TRANSCRIPT_INSERT_ATTEMPTS = 5


async def _find_by_client_segment(db, session_id: int, client_segment_id: str) -> TranscriptRecord | None:
    return await db.scalar(
        select(TranscriptRecord).where(
            TranscriptRecord.session_id == session_id,
            TranscriptRecord.client_segment_id == client_segment_id,
        )
    )


@router.post("/{session_id}/transcripts", response_model=Transcript, status_code=201)
async def add_transcript(
    session_id: int,
    body: TranscriptCreate,
    manager: ManagerRecord = Depends(current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session = await owned_session(db, session_id, manager)
    if body.client_segment_id:
        existing = await _find_by_client_segment(db, session_id, body.client_segment_id)
        if existing:
            return Transcript(**transcript_dict(existing))

    # sequence_no is always assigned by the server: two browser tabs of the same
    # manager (or a retry racing a fresh submit) can both pass the lookup above
    # before either commits, so the insert is retried on a unique-constraint
    # conflict instead of trusting a client-supplied ordering value.
    for attempt in range(MAX_TRANSCRIPT_INSERT_ATTEMPTS):
        current_max = await db.scalar(
            select(func.max(TranscriptRecord.sequence_no)).where(
                TranscriptRecord.session_id == session_id
            )
        )
        sequence_no = (current_max if current_max is not None else -1) + 1
        row = TranscriptRecord(
            session_id=session_id,
            text=body.text.strip(),
            timestamp=body.timestamp or now_iso(),
            speaker=body.speaker,
            client_segment_id=body.client_segment_id,
            sequence_no=sequence_no,
        )
        db.add(row)
        session.last_heartbeat_at = now_iso()
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if body.client_segment_id:
                existing = await _find_by_client_segment(db, session_id, body.client_segment_id)
                if existing:
                    return Transcript(**transcript_dict(existing))
            continue
        await db.refresh(row)
        return Transcript(**transcript_dict(row))

    raise HTTPException(status_code=409, detail="Не удалось сохранить сегмент, попробуйте снова")
