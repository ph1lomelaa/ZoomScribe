from pydantic import BaseModel
from typing import Optional, List


class SessionCreate(BaseModel):
    student_name: str
    manager_name: str
    country: str
    country_flag: str = ""
    zoom_link: str = ""


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


class SessionEndRequest(BaseModel):
    duration_seconds: int


class Transcript(BaseModel):
    id: int
    session_id: int
    text: str
    timestamp: str
    speaker: Optional[str] = None


class TranscriptCreate(BaseModel):
    text: str
    timestamp: Optional[str] = None
    speaker: Optional[str] = None


class Note(BaseModel):
    id: int
    session_id: int
    summary_markdown: str
    created_at: str


class NotePreview(BaseModel):
    id: Optional[int] = None
    summary_preview: Optional[str] = None


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


class GenerateNoteRequest(BaseModel):
    transcript: str
