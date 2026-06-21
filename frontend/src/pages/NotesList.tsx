import { useCallback, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listNotes } from "../api/client";
import { ErrorState, LoadingList } from "../components/AsyncState";
import ManagerFilterDropdown from "../components/ManagerFilterDropdown";
import { useManagerFilter } from "../hooks/useManagerFilter";
import type { NoteWithSession } from "../types";

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
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)}ч ${m % 60}мин`;
}

function stripMd(text: string): string {
  return text
    .replace(/#+\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/- /g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 200);
}

export default function NotesList() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { selectedManagerId, setSelectedManagerId, options } = useManagerFilter();

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    listNotes(selectedManagerId)
      .then(setNotes)
      .catch((err) => setError((err as Error).message || "Не удалось загрузить конспекты"))
      .finally(() => setLoading(false));
  }, [selectedManagerId]);

  useEffect(() => { load(); }, [load]);

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    return (
      n.student_name.toLowerCase().includes(q) ||
      n.manager_name.toLowerCase().includes(q) ||
      n.call_description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-wrap">
      <main className="page-content">
        <h1 className="page-title">Конспекты</h1>
        <p className="page-subtitle">Поиск по вашим завершённым созвонам.</p>
        <div className="mt-6 mb-6 flex flex-wrap items-center gap-3">
          <ManagerFilterDropdown options={options} selectedManagerId={selectedManagerId} onChange={setSelectedManagerId} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ученику или менеджеру..."
            aria-label="Поиск по ученику или менеджеру"
            className="field flex-1 min-w-[14rem]"
          />
        </div>

        {loading ? (
          <LoadingList count={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <h2 className="text-xl font-semibold text-slate-700 mb-2">
              {search ? "Ничего не найдено" : "Нет конспектов"}
            </h2>
            <p className="text-[#64625d] text-sm">
              {search
                ? "Попробуйте другой запрос"
                : "Завершите сессию, чтобы создать конспект"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((note) => (
              <div
                key={note.id}
                className="bg-white border border-[#deddd8] rounded-lg shadow-[0_8px_24px_rgba(32,32,35,.035)] hover:shadow-[0_12px_32px_rgba(32,32,35,.07)] transition-all duration-200 p-4 sm:p-5 flex gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-[#eee9f8] text-[#6147a7] font-bold text-sm flex items-center justify-center shrink-0">
                  {initials(note.student_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-serif font-normal text-[#202023] text-[1.35rem] leading-[1.05]">
                        {note.student_name}
                      </h3>
                      <p className="text-sm text-[#64625d]">{note.manager_name}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/notes/${note.id}`)}
                      className="shrink-0 min-h-11 inline-flex items-center px-1 -mx-1 text-sm text-[#6548b4] font-medium hover:text-[#50388f] transition"
                    >
                      Читать →
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-[#64625d]">
                    <span>{note.country_flag} {note.country}</span>
                    <span>{formatDate(note.started_at)}</span>
                    <span>{formatDuration(note.duration_seconds)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[#6e6c66] line-clamp-2">
                    {note.call_description.trim() || stripMd(note.summary_markdown)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
