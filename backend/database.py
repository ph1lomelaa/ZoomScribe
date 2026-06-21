import logging
import os
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db_models import Base

logger = logging.getLogger(__name__)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        path = os.getenv("DB_PATH", "./data/scribe.db")
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        return f"sqlite+aiosqlite:///{path}"
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


DATABASE_URL = _database_url()
engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"timeout": 30}
else:
    engine_options.update({
        "pool_size": int(os.getenv("DB_POOL_SIZE", "10")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "20")),
        "pool_recycle": 1800,
    })
engine = create_async_engine(DATABASE_URL, **engine_options)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncSession:
    """Open a standalone session for code that runs outside the request's
    dependency lifecycle (e.g. work that continues after a StreamingResponse
    has already been returned, or a one-off script)."""
    return SessionLocal()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: one session per request, shared by every other
    dependency/route handler that also depends on this same callable."""
    session = SessionLocal()
    try:
        yield session
    finally:
        await session.close()


async def init_db() -> None:
    web_concurrency = int(os.getenv("WEB_CONCURRENCY", "1"))
    if DATABASE_URL.startswith("sqlite") and web_concurrency > 1:
        # Each uvicorn --workers process opens its own SQLite connection pool;
        # WAL + busy_timeout avoid corruption but writes still serialize across
        # processes, so this defeats the point of multiple workers. Docker
        # Compose always sets DATABASE_URL to Postgres, so this only fires for
        # a manual non-Docker run that set WEB_CONCURRENCY without DATABASE_URL.
        logger.warning(
            "WEB_CONCURRENCY=%s with a SQLite database: SQLite does not benefit "
            "from multiple worker processes and writes will serialize across "
            "them. Set DATABASE_URL to Postgres, or run with a single worker.",
            web_concurrency,
        )

    async with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            # Multiple API workers can start together; only one runs compatibility DDL.
            await conn.execute(text("SELECT pg_advisory_xact_lock(795608122)"))
        if DATABASE_URL.startswith("sqlite"):
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA foreign_keys=ON"))
            await conn.execute(text("PRAGMA busy_timeout=30000"))

        await conn.run_sync(Base.metadata.create_all)

        # Lightweight compatibility migration for databases created by ZoomScribe 0.1.
        columns = await conn.run_sync(
            lambda sync_conn: {
                table: {column["name"] for column in inspect(sync_conn).get_columns(table)}
                for table in ("managers", "sessions", "transcripts")
            }
        )
        dialect = conn.dialect.name
        integer_type = "INTEGER"
        migrations = [
            ("managers", "role", "VARCHAR(20)"),
            ("managers", "google_sub", "VARCHAR(128)"),
            ("sessions", "manager_id", integer_type),
            ("sessions", "last_heartbeat_at", "TEXT" if dialect == "sqlite" else "VARCHAR(40)"),
            ("transcripts", "client_segment_id", "TEXT" if dialect == "sqlite" else "VARCHAR(64)"),
            ("transcripts", "sequence_no", integer_type),
        ]
        for table, column, column_type in migrations:
            if column not in columns.get(table, set()):
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))

        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_sessions_manager_started "
            "ON sessions (manager_id, started_at)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_managers_google_sub "
            "ON managers (google_sub)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_transcript_client_segment "
            "ON transcripts (session_id, client_segment_id)"
        ))
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_transcript_session_sequence "
            "ON transcripts (session_id, sequence_no)"
        ))

        if dialect == "postgresql":
            # Older deployments created sessions.manager_id with ON DELETE CASCADE.
            # Session/transcript/note history is a business record, not the
            # manager's personal data, so it must survive a manager being
            # removed — replace the constraint with ON DELETE RESTRICT.
            # (SQLite can't alter an existing FK action without rebuilding the
            # table, so local dev databases created before this change keep
            # CASCADE; new ones get RESTRICT from Base.metadata.create_all.)
            await conn.execute(text("""
                DO $$
                DECLARE
                    fk_name text;
                BEGIN
                    SELECT tc.constraint_name INTO fk_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = 'sessions'
                      AND tc.constraint_type = 'FOREIGN KEY'
                      AND kcu.column_name = 'manager_id'
                    LIMIT 1;

                    IF fk_name IS NOT NULL THEN
                        EXECUTE format('ALTER TABLE sessions DROP CONSTRAINT %I', fk_name);
                    END IF;

                    ALTER TABLE sessions
                        ADD CONSTRAINT sessions_manager_id_fkey
                        FOREIGN KEY (manager_id) REFERENCES managers (id) ON DELETE RESTRICT;
                END $$;
            """))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
