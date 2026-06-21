import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteSession, listSessions } from "../api/client";
import SessionCard from "../components/SessionCard";
import { EmptyState, ErrorState, LoadingGrid } from "../components/AsyncState";
import ManagerFilterDropdown from "../components/ManagerFilterDropdown";
import { useManagerFilter } from "../hooks/useManagerFilter";
import type { SessionWithNote } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionWithNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { selectedManagerId, setSelectedManagerId, options } = useManagerFilter();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSessions(await listSessions(selectedManagerId));
    } catch (err) {
      setError((err as Error).message || "Не удалось загрузить созвоны");
    } finally {
      setLoading(false);
    }
  }, [selectedManagerId]);

  useEffect(() => { load(); }, [load]);

  async function remove(id: number) {
    if (!confirm("Удалить созвон и его транскрипт? Это действие нельзя отменить.")) return;
    await deleteSession(id);
    setSessions((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="page-wrap">
      <section className="page-content">
        <div>
          <h1 className="page-title">Последние созвоны</h1>
          <p className="page-subtitle max-w-2xl">Быстрый доступ к активным сессиям и готовым конспектам.</p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <ManagerFilterDropdown options={options} selectedManagerId={selectedManagerId} onChange={setSelectedManagerId} />
          {sessions.length > 4 && <button onClick={() => navigate("/notes")} className="text-sm font-medium text-[#6548b4]">Все конспекты</button>}
        </div>
        <div className="mt-4">
        {loading ? (
          <LoadingGrid count={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="Созвонов пока нет"
            description="Создайте первую запись — транскрипт будет сохраняться по ходу разговора."
            action={
              <button onClick={() => navigate("/new")} className="btn-primary mt-5">Начать первый созвон</button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.slice(0, 6).map((session) => <SessionCard key={session.id} session={session} onDelete={remove} />)}
          </div>
        )}
        </div>
      </section>
    </div>
  );
}
