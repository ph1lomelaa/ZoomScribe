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
  status: "active" | "completed";
}

export interface Transcript {
  id: number;
  session_id: number;
  text: string;
  timestamp: string;
  speaker?: string | null;
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
