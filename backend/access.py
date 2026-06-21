import os
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from db_models import ManagerRecord, NoteRecord, SessionRecord

# A session left "active" with no heartbeat for this long (browser crash, closed
# laptop, lost network) is treated as abandoned. The frontend heartbeats every
# 20s while recording, so this gives generous headroom for transient blips.
STALE_SESSION_TIMEOUT_SECONDS = int(os.getenv("STALE_SESSION_TIMEOUT_SECONDS", "300"))


def is_stale(session: SessionRecord) -> bool:
    if session.status != "active":
        return False
    last_seen = session.last_heartbeat_at or session.started_at
    try:
        last_seen_at = datetime.fromisoformat(last_seen)
    except (TypeError, ValueError):
        return False
    if last_seen_at.tzinfo is None:
        last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - last_seen_at).total_seconds()
    return age > STALE_SESSION_TIMEOUT_SECONDS


async def mark_stale_sessions(db, sessions: list[SessionRecord]) -> None:
    """Lazily flip abandoned 'active' sessions to 'abandoned' on read, since
    there's no background worker in this deployment to sweep them on a timer."""
    changed = False
    for session in sessions:
        if is_stale(session):
            session.status = "abandoned"
            changed = True
    if changed:
        await db.commit()


def is_admin(manager: ManagerRecord) -> bool:
    return (manager.role or "manager") == "admin"


def require_admin(manager: ManagerRecord) -> ManagerRecord:
    if not is_admin(manager):
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return manager


async def owned_session(db, session_id: int, manager: ManagerRecord) -> SessionRecord:
    filters = [SessionRecord.id == session_id]
    if not is_admin(manager):
        filters.append(SessionRecord.manager_id == manager.id)
    row = await db.scalar(select(SessionRecord).where(*filters))
    if not row:
        raise HTTPException(status_code=404, detail="Созвон не найден")
    return row


async def owned_note(db, note_id: int, manager: ManagerRecord) -> tuple[NoteRecord, SessionRecord]:
    filters = [NoteRecord.id == note_id]
    if not is_admin(manager):
        filters.append(SessionRecord.manager_id == manager.id)
    result = await db.execute(
        select(NoteRecord, SessionRecord)
        .join(SessionRecord, SessionRecord.id == NoteRecord.session_id)
        .where(*filters)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Конспект не найден")
    return row
