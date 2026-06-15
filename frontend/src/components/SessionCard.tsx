import { useNavigate } from "react-router-dom";
import type { SessionWithNote } from "../types";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}ч ${m % 60}мин`;
  return `${m} мин`;
}

interface Props {
  session: SessionWithNote;
  onDelete: (id: number) => void;
}

export default function SessionCard({ session, onDelete }: Props) {
  const navigate = useNavigate();
  const isActive = session.status === "active";

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
            {initials(session.student_name)}
          </div>
          <span
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              isActive
                ? "bg-green-100 text-green-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-dot" />
            )}
            {isActive ? "В процессе" : "Завершён"}
          </span>
        </div>

        <h3 className="font-semibold text-slate-900 text-base leading-tight">
          {session.student_name}
        </h3>
        <p className="text-sm text-slate-500 mt-0.5">{session.manager_name}</p>

        <div className="flex items-center gap-1.5 mt-3 text-sm text-slate-600">
          <span>{session.country_flag}</span>
          <span>{session.country}</span>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
          <span>{formatDate(session.started_at)}</span>
          {session.duration_seconds > 0 && (
            <span>{formatDuration(session.duration_seconds)}</span>
          )}
        </div>

        {(session.zoom_link || session.note_preview) && (
          <p className="mt-3 text-xs text-slate-500 leading-relaxed line-clamp-2 bg-slate-50 rounded-lg p-2">
            {session.zoom_link.trim() || session.note_preview}
          </p>
        )}
      </div>

      <div className="px-5 pb-4 flex items-center gap-2 border-t border-slate-50 pt-3">
        {isActive ? (
          <button
            onClick={() => navigate(`/session/${session.id}`)}
            className="flex-1 bg-indigo-500 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-600 transition"
          >
            Продолжить
          </button>
        ) : session.note_id ? (
          <button
            onClick={() => navigate(`/notes/${session.note_id}`)}
            className="flex-1 bg-indigo-500 text-white text-sm font-medium rounded-lg py-2 hover:bg-indigo-600 transition"
          >
            Конспект
          </button>
        ) : (
          <button
            onClick={() => navigate(`/session/${session.id}`)}
            className="flex-1 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg py-2 hover:bg-slate-50 transition"
          >
            Открыть
          </button>
        )}
        <button
          onClick={() => onDelete(session.id)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition"
          title="Удалить"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
