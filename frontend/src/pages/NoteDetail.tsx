import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getNote, getSession } from "../api/client";
import type { NoteWithSession, Transcript } from "../types";
import { renderMarkdown } from "../utils/markdown";

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

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteWithSession | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    getNote(Number(id)).then((n) => {
      setNote(n);
      getSession(n.session_id).then((s) => setTranscripts(s.transcripts || []));
    });
  }, [id]);

  async function copyMarkdown() {
    if (!note) return;
    await navigator.clipboard.writeText(note.summary_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!note) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm no-print">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/notes")}
            className="text-slate-500 hover:text-slate-800 transition text-sm flex items-center gap-1"
          >
            ← Назад
          </button>
          <span className="font-bold text-slate-900 flex-1">Конспект урока</span>
          <div className="flex items-center gap-2">
            <button
              onClick={copyMarkdown}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 transition"
            >
              Печать
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex gap-4 items-start">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 font-bold text-lg flex items-center justify-center shrink-0">
            {initials(note.student_name)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">{note.student_name}</h1>
            <p className="text-slate-500 text-sm">{note.manager_name}</p>
            {note.call_description && (
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                {note.call_description}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {note.country_flag} {note.country}
              </span>
              <span className="inline-flex items-center bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {formatDate(note.started_at)}
              </span>
              <span className="inline-flex items-center bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
                {formatDuration(note.duration_seconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Note content */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <div
            className="prose-custom"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.summary_markdown) }}
          />
        </div>

        {/* Transcript collapsible */}
        {transcripts.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden no-print">
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
            >
              <span className="font-medium text-slate-700 text-sm">
                Транскрипция ({transcripts.length} фрагментов)
              </span>
              <span className="text-slate-400 text-sm">
                {showTranscript ? "Скрыть" : "Показать"}
              </span>
            </button>
            {showTranscript && (
              <div className="px-6 pb-6 space-y-2 border-t border-slate-100 pt-4 max-h-96 overflow-y-auto">
                {transcripts.map((t) => (
                  <div key={t.id} className="flex gap-3 text-sm">
                    <span className="text-xs text-slate-400 shrink-0 mt-0.5 tabular-nums">
                      {new Date(t.timestamp).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <p className="text-slate-700 leading-relaxed">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
