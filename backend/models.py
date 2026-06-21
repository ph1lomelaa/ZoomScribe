from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class Manager(BaseModel):
    id: int
    email: str
    full_name: str
    role: str = "manager"


class AdminManager(Manager):
    created_at: str
    google_linked: bool = False
    session_count: int = 0


class ManagerRoleUpdate(BaseModel):
    role: Literal["manager", "admin"]


class RegisterRequest(BaseModel):
    email: str
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class SessionCreate(BaseModel):
    student_name: str = Field(min_length=1, max_length=200)
    country: str = Field(min_length=1, max_length=120)
    country_flag: str = Field(default="", max_length=16)
    zoom_link: str = Field(default="", max_length=2000)


class Session(BaseModel):
    id: int
    student_name: str
    manager_name: str
    country: str
    country_flag: str
    zoom_link: str
    started_at: str
    ended_at: Optional[str] = None
    duration_seconds: int
    status: str
    last_heartbeat_at: Optional[str] = None


class SessionEndRequest(BaseModel):
    duration_seconds: int = Field(ge=0, le=24 * 60 * 60)


class Transcript(BaseModel):
    id: int
    session_id: int
    text: str
    timestamp: str
    speaker: Optional[str] = None
    client_segment_id: Optional[str] = None
    sequence_no: Optional[int] = None


class TranscriptCreate(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    timestamp: Optional[str] = None
    speaker: Optional[str] = Field(default=None, max_length=100)
    client_segment_id: Optional[str] = Field(default=None, max_length=64)
    sequence_no: Optional[int] = Field(default=None, ge=0)


class Note(BaseModel):
    id: int
    session_id: int
    summary_markdown: str
    created_at: str


class SessionWithNote(Session):
    note_preview: Optional[str] = None
    note_id: Optional[int] = None


class SessionDetail(Session):
    transcripts: List[Transcript] = []
    note: Optional[Note] = None


class NoteWithSession(Note):
    student_name: str
    manager_name: str
    country: str
    country_flag: str
    call_description: str = ""
    started_at: str
    duration_seconds: int


class AskNoteRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)


class NoteQuestion(BaseModel):
    id: int
    note_id: int
    question: str
    answer: str
    created_at: str


