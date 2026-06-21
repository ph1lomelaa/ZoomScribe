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
  const statusLabel = isActive ? "В процессе" : session.status === "abandoned" ? "Прерван" : "Завершён";

  return (
    <div className="bg-white border border-[#deddd8] rounded-lg shadow-[0_8px_24px_rgba(32,32,35,.035)] hover:shadow-[0_12px_32px_rgba(32,32,35,.07)] transition-all duration-200 flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between mb-3">
          <div className="w-11 h-11 rounded-full bg-[#eee9f8] text-[#6147a7] font-bold text-sm flex items-center justify-center shrink-0">
            {initials(session.student_name)}
          </div>
          <span
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              isActive
                ? "bg-[#eee9f8] text-[#6147a7]"
                : "bg-[#f0efeb] text-[#6e6c66]"
            }`}
          >
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#8b67df] animate-pulse-dot" />
            )}
            {statusLabel}
          </span>
        </div>

        <h3 className="font-serif font-normal text-[#202023] text-[1.2rem] leading-[1.05]">
          {session.student_name}
        </h3>
        <p className="text-sm text-[#64625d] mt-0.5">{session.manager_name}</p>

        <div className="flex items-center gap-1.5 mt-3 text-sm text-[#5d5b56]">
          <span>{session.country_flag}</span>
          <span>{session.country}</span>
        </div>

        <div className="flex items-center gap-3 mt-2 text-xs text-[#64625d]">
          <span>{formatDate(session.started_at)}</span>
          {session.duration_seconds > 0 && (
            <span>{formatDuration(session.duration_seconds)}</span>
          )}
        </div>

        {(session.zoom_link || session.note_preview) && (
          <p className="mt-3 text-xs text-[#6e6c66] leading-relaxed line-clamp-2 bg-[#f7f6f2] rounded-lg p-2">
            {session.zoom_link.trim() || session.note_preview}
          </p>
        )}
      </div>

      <div className="px-4 pb-4 flex items-center gap-2 border-t border-[#efede8] pt-3">
        {isActive ? (
          <button
            onClick={() => navigate(`/session/${session.id}`)}
            className="flex-1 min-h-11 bg-[#242426] text-white text-sm font-medium rounded-full px-4 hover:bg-black transition"
          >
            Продолжить
          </button>
        ) : session.note_id ? (
          <button
            onClick={() => navigate(`/notes/${session.note_id}`)}
            className="flex-1 min-h-11 bg-[#242426] text-white text-sm font-medium rounded-full px-4 hover:bg-black transition"
          >
            Конспект
          </button>
        ) : (
          <button
            onClick={() => navigate(`/session/${session.id}`)}
            className="flex-1 min-h-11 border border-[#d9d7d1] text-[#363638] text-sm font-medium rounded-full px-4 hover:bg-[#f2f0eb] transition"
          >
            Открыть
          </button>
        )}
        <button
          onClick={() => onDelete(session.id)}
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full border border-[#e6d9d6] text-[#a76b62] hover:bg-[#fbf0ee] transition"
          title="Удалить"
          aria-label="Удалить созвон"
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
