import type {
  Session,
  SessionWithNote,
  SessionDetail,
  Transcript,
  NoteWithSession,
} from "../types";

const BASE = "/api";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function createSession(data: {
  student_name: string;
  manager_name: string;
  country: string;
  country_flag: string;
  zoom_link?: string;
}): Promise<Session> {
  return req<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listSessions(): Promise<SessionWithNote[]> {
  return req<SessionWithNote[]>("/sessions");
}

export async function getSession(id: number): Promise<SessionDetail> {
  return req<SessionDetail>(`/sessions/${id}`);
}

export async function endSession(
  id: number,
  duration_seconds: number
): Promise<Session> {
  return req<Session>(`/sessions/${id}/end`, {
    method: "PATCH",
    body: JSON.stringify({ duration_seconds }),
  });
}

export async function deleteSession(id: number): Promise<void> {
  await req<unknown>(`/sessions/${id}`, { method: "DELETE" });
}

export async function addTranscript(
  sessionId: number,
  text: string,
  timestamp?: string,
  speaker?: string
): Promise<Transcript> {
  return req<Transcript>(`/sessions/${sessionId}/transcripts`, {
    method: "POST",
    body: JSON.stringify({ text, timestamp, speaker }),
  });
}

export async function generateNote(
  sessionId: number,
  transcript: string
): Promise<Response> {
  return fetch(`${BASE}/sessions/${sessionId}/notes/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
}

export async function listNotes(): Promise<NoteWithSession[]> {
  return req<NoteWithSession[]>("/notes");
}

export async function getNote(id: number): Promise<NoteWithSession> {
  return req<NoteWithSession>(`/notes/${id}`);
}
