import type {
  AdminManager, Manager, NoteQuestion, NoteWithSession, Session, SessionDetail,
  SessionWithNote, Transcript,
} from "../types";

const BASE = "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const payload = await res.json();
      message = payload.detail || message;
    } catch {
      message = await res.text().catch(() => message);
    }
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("zoomscribe:unauthorized"));
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const getMe = () => req<Manager>("/auth/me");
export const login = (email: string, password: string) =>
  req<Manager>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (full_name: string, email: string, password: string) =>
  req<Manager>("/auth/register", {
    method: "POST", body: JSON.stringify({ full_name, email, password }),
  });
export const logout = () => req<void>("/auth/logout", { method: "POST" });

export const startGoogleLogin = (next = "/") => {
  const url = new URL(`${BASE}/auth/google/start`, window.location.origin);
  url.searchParams.set("next", next);
  window.location.assign(url.toString());
};

export async function createSession(data: {
  student_name: string;
  country: string;
  country_flag: string;
  zoom_link?: string;
}): Promise<Session> {
  return req<Session>("/sessions", { method: "POST", body: JSON.stringify(data) });
}

export const listSessions = (managerId?: number | null) =>
  req<SessionWithNote[]>(`/sessions${managerId != null ? `?manager_id=${managerId}` : ""}`);
export const getSession = (id: number) => req<SessionDetail>(`/sessions/${id}`);
export const heartbeat = (id: number) =>
  req<void>(`/sessions/${id}/heartbeat`, { method: "POST" });
export const endSession = (id: number, duration_seconds: number) =>
  req<Session>(`/sessions/${id}/end`, {
    method: "PATCH", body: JSON.stringify({ duration_seconds }),
  });
export const deleteSession = (id: number) =>
  req<void>(`/sessions/${id}`, { method: "DELETE" });

export function addTranscript(
  sessionId: number,
  text: string,
  timestamp?: string,
  speaker?: string,
  clientSegmentId?: string,
  sequenceNo?: number,
): Promise<Transcript> {
  return req<Transcript>(`/sessions/${sessionId}/transcripts`, {
    method: "POST",
    body: JSON.stringify({
      text, timestamp, speaker,
      client_segment_id: clientSegmentId,
      sequence_no: sequenceNo,
    }),
  });
}

export function generateNote(sessionId: number, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE}/sessions/${sessionId}/notes/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal,
  });
}

export function generateLiveSummary(sessionId: number): Promise<Response> {
  return fetch(`${BASE}/sessions/${sessionId}/summaries/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export const listNotes = (managerId?: number | null) =>
  req<NoteWithSession[]>(`/notes${managerId != null ? `?manager_id=${managerId}` : ""}`);
export const getNote = (id: number) => req<NoteWithSession>(`/notes/${id}`);
export const askNote = (id: number, question: string) =>
  req<NoteQuestion>(`/notes/${id}/questions`, {
    method: "POST", body: JSON.stringify({ question }),
  });
export const listNoteQuestions = (id: number) =>
  req<NoteQuestion[]>(`/notes/${id}/questions`);

export const getDeepgramToken = () =>
  req<{ access_token: string; expires_in: number }>("/integrations/deepgram/token", {
    method: "POST",
  });

export const listAdminManagers = () => req<AdminManager[]>("/admin/managers");
export const updateManagerRole = (managerId: number, role: "manager" | "admin") =>
  req<AdminManager>(`/admin/managers/${managerId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
