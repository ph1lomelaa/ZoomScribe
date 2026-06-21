from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ManagerRecord(Base):
    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="manager", nullable=False)
    google_sub: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class AuthSessionRecord(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    manager_id: Mapped[int] = mapped_column(
        ForeignKey("managers.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    expires_at: Mapped[str] = mapped_column(String(40), index=True, nullable=False)


class SessionRecord(Base):
    __tablename__ = "sessions"
    __table_args__ = (Index("ix_sessions_manager_started", "manager_id", "started_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # RESTRICT, not CASCADE: a session's transcripts/notes are the company's
    # business record of a student call, not the manager's personal data —
    # removing a manager account must not silently wipe that history.
    manager_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("managers.id", ondelete="RESTRICT"), nullable=True
    )
    student_name: Mapped[str] = mapped_column(String(200), nullable=False)
    manager_name: Mapped[str] = mapped_column(String(160), nullable=False)
    country: Mapped[str] = mapped_column(String(120), nullable=False)
    country_flag: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    zoom_link: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[str] = mapped_column(String(40), nullable=False)
    ended_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    last_heartbeat_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class TranscriptRecord(Base):
    __tablename__ = "transcripts"
    __table_args__ = (
        UniqueConstraint("session_id", "client_segment_id", name="uq_transcript_client_segment"),
        UniqueConstraint("session_id", "sequence_no", name="uq_transcript_session_sequence"),
        Index("ix_transcripts_session_sequence", "session_id", "sequence_no", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[str] = mapped_column(String(40), nullable=False)
    speaker: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    client_segment_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sequence_no: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class NoteRecord(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    summary_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class NoteQuestionRecord(Base):
    __tablename__ = "note_questions"
    __table_args__ = (Index("ix_note_questions_note_created", "note_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), nullable=False
    )
    manager_id: Mapped[int] = mapped_column(
        ForeignKey("managers.id", ondelete="CASCADE"), nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
