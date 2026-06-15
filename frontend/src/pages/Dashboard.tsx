import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { listSessions, deleteSession, createSession } from "../api/client";
import type { SessionWithNote } from "../types";
import SessionCard from "../components/SessionCard";
import NewSessionModal from "../components/NewSessionModal";

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionWithNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function handleCreate(data: {
    student_name: string;
    manager_name: string;
    country: string;
    country_flag: string;
    zoom_link: string;
  }) {
    const session = await createSession(data);
    setShowModal(false);
    navigate(`/session/${session.id}`);
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить сессию? Это действие нельзя отменить.")) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="min-h-screen bg-surface">
      <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="font-bold text-lg text-slate-900">ZoomScribe</span>
          <a
            href="/notes"
            onClick={(e) => { e.preventDefault(); navigate("/notes"); }}
            className="text-sm text-slate-600 hover:text-indigo-600 font-medium transition"
          >
            Конспекты
          </a>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Сессии</h1>
            <p className="text-slate-500 text-sm mt-1">
              {sessions.length > 0
                ? `${sessions.length} сессий · AI-конспекты консультаций`
                : "Начните свою первую сессию"}
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="no-print flex items-center gap-2 bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition shadow-sm"
          >
            + Новая сессия
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-xl h-52 animate-pulse"
              />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <h2 className="text-xl font-semibold text-slate-700 mb-2">
              Нет активных сессий
            </h2>
            <p className="text-slate-400 text-sm mb-6 max-w-xs">
              Создайте новую сессию, чтобы начать конспектирование урока
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-600 transition"
            >
              + Новая сессия
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      <button
        onClick={() => setShowModal(true)}
        className="no-print fixed bottom-6 right-6 w-14 h-14 bg-indigo-500 text-white text-2xl rounded-full shadow-lg hover:bg-indigo-600 transition flex items-center justify-center sm:hidden"
      >
        +
      </button>

      {showModal && (
        <NewSessionModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
