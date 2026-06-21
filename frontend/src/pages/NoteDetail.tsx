import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { askNote, getNote, getSession, listNoteQuestions } from "../api/client";
import type { NoteQuestion, NoteWithSession, Transcript } from "../types";
import { renderMarkdown } from "../utils/markdown";
import { ErrorState } from "../components/AsyncState";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)}ч ${minutes % 60}мин`;
}

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const noteId = Number(id);
  const [note, setNote] = useState<NoteWithSession | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [questions, setQuestions] = useState<NoteQuestion[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!noteId) return;
    setError("");
    Promise.all([getNote(noteId), listNoteQuestions(noteId)]).then(([loadedNote, loadedQuestions]) => {
      setNote(loadedNote);
      setQuestions(loadedQuestions);
      getSession(loadedNote.session_id).then((session) => setTranscripts(session.transcripts || []));
    }).catch((err) => setError((err as Error).message || "Не удалось загрузить конспект"));
  }, [noteId]);

  async function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || asking) return;
    setAsking(true);
    try {
      const answer = await askNote(noteId, value);
      setQuestions((current) => [...current, answer]);
      setQuestion("");
    } finally {
      setAsking(false);
    }
  }

  async function copy() {
    if (!note) return;
    await navigator.clipboard.writeText(note.summary_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  if (!note) {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return <div className="min-h-screen grid place-items-center"><div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="page-wrap no-print-padding">
      <div className="max-w-5xl">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 no-print">
          <div>
            <button onClick={() => navigate("/notes")} className="text-sm text-slate-500 hover:text-slate-900 mb-3">← Все конспекты</button>
            <h1 className="page-title">{note.student_name}</h1>
            <div className="page-subtitle mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{note.manager_name}</span><span>•</span><span>{formatDate(note.started_at)}</span><span>•</span><span>{formatDuration(note.duration_seconds)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={copy} className="btn-secondary">{copied ? "Скопировано" : "Копировать"}</button>
            <button onClick={() => window.print()} className="btn-secondary">Печать</button>
          </div>
        </div>

        <div className="mt-6 grid xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
          <div className="space-y-5">
            {note.call_description && <div className="card p-5 text-sm text-slate-600 leading-6"><span className="font-medium text-slate-900">Цель созвона: </span>{note.call_description}</div>}
            <article className="card p-5 sm:p-8"><div className="prose-custom" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.summary_markdown) }} /></article>
            {transcripts.length > 0 && (
              <section className="card overflow-hidden no-print">
                <button onClick={() => setShowTranscript(!showTranscript)} className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50">
                  <span><strong className="text-slate-900">Полная транскрипция</strong><span className="block text-xs text-slate-500 mt-1">{transcripts.length} сохранённых фрагментов</span></span>
                  <span className="text-sm text-[#6548b4]">{showTranscript ? "Скрыть" : "Открыть"}</span>
                </button>
                {showTranscript && <div className="border-t border-slate-100 p-5 max-h-[32rem] overflow-y-auto space-y-3">
                  {transcripts.map((item) => <div key={item.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm">
                    <span className="text-xs text-slate-400 pt-1">{item.speaker || new Date(item.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    <p className="text-slate-700 leading-6">{item.text}</p>
                  </div>)}
                </div>}
              </section>
            )}
          </div>

          <aside className="card p-5 xl:sticky xl:top-6 no-print">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#eee9f8] text-[#6147a7] grid place-items-center">✦</div>
              <div><h2 className="font-semibold text-slate-900">Вопрос по созвону</h2><p className="text-xs text-slate-500">Ответ по полному транскрипту</p></div>
            </div>
            <div className="mt-5 max-h-80 overflow-y-auto space-y-4">
              {questions.length === 0 && <p className="text-sm text-slate-500 leading-6">Например: «Какие документы должен прислать студент?» или «Какой дедлайн назвали?»</p>}
              {questions.map((item) => <div key={item.id} className="space-y-2">
                <div className="ml-6 rounded-xl rounded-br-sm bg-slate-100 px-3 py-2 text-sm text-slate-700">{item.question}</div>
                <div className="mr-4 rounded-xl rounded-bl-sm bg-[#f2eef9] border border-[#e3dcf2] px-3 py-2 text-sm text-slate-700 leading-5">{item.answer}</div>
              </div>)}
            </div>
            <form onSubmit={submitQuestion} className="mt-5">
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="field min-h-24 resize-none" placeholder="Введите вопрос…" />
              <button disabled={asking || !question.trim()} className="btn-primary w-full mt-2">{asking ? "Ищу ответ…" : "Найти в созвоне"}</button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
