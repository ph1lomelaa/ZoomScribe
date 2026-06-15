from fastapi import APIRouter, HTTPException
from database import get_db, now_iso
from models import (
    SessionCreate, Session, SessionWithNote, SessionDetail,
    SessionEndRequest, Transcript, TranscriptCreate
)
import re

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def strip_markdown(text: str, limit: int = 200) -> str:
    text = re.sub(r"#+ ", "", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"- ", "", text)
    text = re.sub(r"\n+", " ", text).strip()
    return text[:limit]


@router.post("", response_model=Session)
async def create_session(body: SessionCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO sessions
               (student_name, manager_name, country, country_flag, zoom_link, started_at, status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')""",
            (body.student_name, body.manager_name, body.country,
             body.country_flag, body.zoom_link, now_iso()),
        )
        await db.commit()
        row = await db.execute("SELECT * FROM sessions WHERE id=?", (cursor.lastrowid,))
        session = await row.fetchone()
        return dict(session)
    finally:
        await db.close()


@router.get("", response_model=list[SessionWithNote])
async def list_sessions():
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT s.*, n.id as note_id, n.summary_markdown
            FROM sessions s
            LEFT JOIN notes n ON n.session_id = s.id
            ORDER BY s.started_at DESC
        """)
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            note_preview = None
            if d.get("summary_markdown"):
                note_preview = strip_markdown(d["summary_markdown"])
            result.append(SessionWithNote(
                id=d["id"],
                student_name=d["student_name"],
                manager_name=d["manager_name"],
                country=d["country"],
                country_flag=d["country_flag"] or "",
                zoom_link=d["zoom_link"] or "",
                started_at=d["started_at"],
                ended_at=d.get("ended_at"),
                duration_seconds=d["duration_seconds"] or 0,
                status=d["status"],
                note_preview=note_preview,
                note_id=d.get("note_id"),
            ))
        return result
    finally:
        await db.close()


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(session_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id=?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        t_cursor = await db.execute(
            "SELECT * FROM transcripts WHERE session_id=? ORDER BY id ASC",
            (session_id,)
        )
        transcripts = [dict(r) for r in await t_cursor.fetchall()]

        n_cursor = await db.execute(
            "SELECT * FROM notes WHERE session_id=?", (session_id,)
        )
        note_row = await n_cursor.fetchone()
        note = dict(note_row) if note_row else None

        return SessionDetail(
            **dict(session),
            transcripts=transcripts,
            note=note,
        )
    finally:
        await db.close()


@router.patch("/{session_id}/end", response_model=Session)
async def end_session(session_id: int, body: SessionEndRequest):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id=?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        await db.execute(
            "UPDATE sessions SET status='completed', ended_at=?, duration_seconds=? WHERE id=?",
            (now_iso(), body.duration_seconds, session_id),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM sessions WHERE id=?", (session_id,))
        updated = await cursor.fetchone()
        return dict(updated)
    finally:
        await db.close()


@router.delete("/{session_id}")
async def delete_session(session_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        await db.execute("DELETE FROM transcripts WHERE session_id=?", (session_id,))
        await db.execute("DELETE FROM notes WHERE session_id=?", (session_id,))
        await db.execute("DELETE FROM sessions WHERE id=?", (session_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.post("/{session_id}/transcripts", response_model=Transcript)
async def add_transcript(session_id: int, body: TranscriptCreate):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        ts = body.timestamp or now_iso()
        cursor = await db.execute(
            "INSERT INTO transcripts (session_id, text, timestamp, speaker) VALUES (?, ?, ?, ?)",
            (session_id, body.text, ts, body.speaker),
        )
        await db.commit()
        cursor = await db.execute("SELECT * FROM transcripts WHERE id=?", (cursor.lastrowid,))
        row = await cursor.fetchone()
        return dict(row)
    finally:
        await db.close()
