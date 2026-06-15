from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from database import get_db, now_iso
from models import Note, NoteWithSession, GenerateNoteRequest
from services.claude import stream_final_note
from datetime import datetime, timezone

router = APIRouter(tags=["notes"])


def format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds} сек"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} мин"
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours}ч {mins}мин"


def format_date(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d.%m.%Y")
    except Exception:
        return iso_str


@router.post("/api/sessions/{session_id}/notes/generate")
async def generate_note(session_id: int, body: GenerateNoteRequest):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id=?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session = dict(session)
    finally:
        await db.close()

    collected: list[str] = []

    async def generate():
        async for chunk in stream_final_note(
            transcript=body.transcript,
            student_name=session["student_name"],
            manager_name=session["manager_name"],
            country=session["country"],
            call_description=session.get("zoom_link") or "",
            date=format_date(session["started_at"]),
            duration=format_duration(session.get("duration_seconds") or 0),
        ):
            collected.append(chunk)
            yield chunk

        full_text = "".join(collected)
        db2 = await get_db()
        try:
            await db2.execute(
                "INSERT OR REPLACE INTO notes (session_id, summary_markdown, created_at) VALUES (?, ?, ?)",
                (session_id, full_text, now_iso()),
            )
            await db2.commit()
        finally:
            await db2.close()

    return StreamingResponse(generate(), media_type="text/plain")


@router.get("/api/notes", response_model=list[NoteWithSession])
async def list_notes():
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT n.*, s.student_name, s.manager_name, s.country, s.country_flag,
                   s.zoom_link as call_description,
                   s.started_at, s.duration_seconds
            FROM notes n
            JOIN sessions s ON s.id = n.session_id
            ORDER BY n.created_at DESC
        """)
        rows = await cursor.fetchall()
        return [NoteWithSession(**dict(r)) for r in rows]
    finally:
        await db.close()


@router.get("/api/notes/{note_id}", response_model=NoteWithSession)
async def get_note(note_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT n.*, s.student_name, s.manager_name, s.country, s.country_flag,
                   s.zoom_link as call_description,
                   s.started_at, s.duration_seconds
            FROM notes n
            JOIN sessions s ON s.id = n.session_id
            WHERE n.id=?
        """, (note_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Note not found")
        return NoteWithSession(**dict(row))
    finally:
        await db.close()
