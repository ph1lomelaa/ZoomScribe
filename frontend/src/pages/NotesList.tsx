import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listNotes } from "../api/client";
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    listNotes()
      .then(setNotes)
      .finally(() => setLoading(false));
  }, []);

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    return (
      n.student_name.toLowerCase().includes(q) ||
      n.manager_name.toLowerCase().includes(q) ||
      n.call_description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-surface">
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-slate-500 hover:text-slate-800 transition text-sm"
          >
            ← Назад
          </button>
          <span className="font-bold text-slate-900 text-lg">Конспекты</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ученику или менеджеру..."
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white shadow-sm"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl h-24 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold text-slate-700 mb-2">
              {search ? "Ничего не найдено" : "Нет конспектов"}
            </h2>
            <p className="text-slate-400 text-sm">
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
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 flex gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                  {initials(note.student_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {note.student_name}
                      </h3>
                      <p className="text-sm text-slate-500">{note.manager_name}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/notes/${note.id}`)}
                      className="shrink-0 text-sm text-indigo-600 font-medium hover:text-indigo-800 transition"
                    >
                      Читать →
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>{note.country_flag} {note.country}</span>
                    <span>{formatDate(note.started_at)}</span>
                    <span>{formatDuration(note.duration_seconds)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 line-clamp-2">
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
