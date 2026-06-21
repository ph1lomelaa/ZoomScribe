import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listAdminManagers, updateManagerRole } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { EmptyState, ErrorState, LoadingList } from "../components/AsyncState";
import type { AdminManager } from "../types";

export default function AdminPage() {
  const navigate = useNavigate();
  const { manager, isAdmin } = useAuth();
  const [users, setUsers] = useState<AdminManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<AdminManager | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState("");

  const load = useCallback(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    listAdminManagers()
      .then(setUsers)
      .catch((err) => setError((err as Error).message || "Не удалось загрузить аккаунты"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  if (!manager) return null;

  if (!isAdmin) {
    return (
      <div className="page-wrap">
        <div className="page-content-narrow card p-8">
          <h1 className="page-title">Нет доступа</h1>
          <p className="page-subtitle">Эта страница доступна только администратору.</p>
          <button onClick={() => navigate("/")} className="btn-primary mt-6">Вернуться назад</button>
        </div>
      </div>
    );
  }

  async function confirmPromote() {
    if (!confirmTarget) return;
    setPromoting(true);
    setPromoteError("");
    try {
      const updated = await updateManagerRole(confirmTarget.id, "admin");
      // Real backend round-trip already happened — this just reflects the
      // response in the card without a full page reload.
      setUsers((current) => current.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
      setConfirmTarget(null);
    } catch (err) {
      setPromoteError((err as Error).message || "Не удалось обновить роль");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-content">
        <h1 className="page-title">Админ</h1>
        <p className="page-subtitle">Все аккаунты и роли в одном месте.</p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-[#202023]">Аккаунты</h2>
          {loading ? (
            <div className="mt-4"><LoadingList count={3} /></div>
          ) : error ? (
            <div className="mt-4"><ErrorState message={error} onRetry={load} /></div>
          ) : users.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Аккаунтов пока нет" description="Менеджеры появятся здесь после регистрации." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {users.map((user) => (
                <div key={user.id} className="card p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-[#202023] truncate">{user.full_name}</div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={`px-2.5 py-1 rounded-full ${user.role === "admin" ? "bg-[#eee9f8] text-[#6147a7]" : "bg-[#f0efeb] text-[#6e6c66]"}`}>
                      {user.role}
                    </span>
                    {user.role !== "admin" && (
                      <button
                        onClick={() => { setPromoteError(""); setConfirmTarget(user); }}
                        className="btn-secondary px-4"
                      >
                        Добавить админа
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <h2 className="font-semibold text-lg text-[#202023]">
              Сделать {confirmTarget.full_name} админом?
            </h2>
            <p className="mt-2 text-sm text-[#64625d]">
              {confirmTarget.full_name} получит доступ ко всем созвонам и конспектам всех менеджеров.
            </p>
            {promoteError && <p className="mt-3 text-sm text-red-600">{promoteError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmTarget(null)} disabled={promoting} className="btn-secondary">
                Отмена
              </button>
              <button onClick={confirmPromote} disabled={promoting} className="btn-primary">
                {promoting ? "Подтверждаю…" : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
