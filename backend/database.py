import aiosqlite
import os
from datetime import datetime, timezone

DB_PATH = os.getenv("DB_PATH", "./data/scribe.db")


async def get_db() -> aiosqlite.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys = ON")
    return db


async def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")   # concurrent multi-user writes
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_name TEXT NOT NULL,
                manager_name TEXT NOT NULL,
                country TEXT NOT NULL,
                country_flag TEXT DEFAULT '',
                zoom_link TEXT DEFAULT '',
                started_at TEXT NOT NULL,
                ended_at TEXT,
                duration_seconds INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active'
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id),
                text TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                speaker TEXT
            )
        """)
        # migration for existing DBs
        try:
            await db.execute("ALTER TABLE transcripts ADD COLUMN speaker TEXT")
            await db.commit()
        except Exception:
            pass
        await db.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL UNIQUE REFERENCES sessions(id),
                summary_markdown TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        await db.commit()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
