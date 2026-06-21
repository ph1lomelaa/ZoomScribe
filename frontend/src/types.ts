export interface Manager {
  id: number;
  email: string;
  full_name: string;
  role: "manager" | "admin" | string;
  has_password: boolean;
}

export interface Session {
  id: number;
  student_name: string;
  manager_name: string;
  country: string;
  country_flag: string;
  zoom_link: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: "active" | "completed" | "abandoned";
  last_heartbeat_at?: string | null;
}

export interface Transcript {
  id: number;
  session_id: number;
  text: string;
  timestamp: string;
  speaker?: string | null;
  client_segment_id?: string | null;
  sequence_no?: number | null;
}

export interface Note {
  id: number;
  session_id: number;
  summary_markdown: string;
  created_at: string;
}

export interface SessionWithNote extends Session {
  note_preview: string | null;
  note_id: number | null;
}

export interface SessionDetail extends Session {
  transcripts: Transcript[];
  note: Note | null;
}

export interface NoteWithSession extends Note {
  student_name: string;
  manager_name: string;
  country: string;
  country_flag: string;
  call_description: string;
  started_at: string;
  duration_seconds: number;
}

export interface NoteQuestion {
  id: number;
  note_id: number;
  question: string;
  answer: string;
  created_at: string;
}

export interface AdminManager extends Manager {
  created_at: string;
  google_linked: boolean;
  session_count: number;
}
