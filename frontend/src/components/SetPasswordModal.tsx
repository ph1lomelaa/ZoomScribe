import { FormEvent, useState } from "react";
import { setPassword } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Props {
  onClose: () => void;
}

export default function SetPasswordModal({ onClose }: Props) {
  const { manager, updateManager } = useAuth();
  const hasPassword = manager?.has_password ?? false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Пароль должен быть не короче 8 символов");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    setSaving(true);
    try {
      const updated = await setPassword(newPassword, hasPassword ? currentPassword : undefined);
      updateManager(updated);
      setDone(true);
    } catch (err) {
      setError((err as Error).message || "Не удалось обновить пароль");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
        {done ? (
          <>
            <h2 className="font-semibold text-lg text-[#202023]">Пароль обновлён</h2>
            <p className="mt-2 text-sm text-[#64625d]">
              Теперь можно входить по email и этому паролю — не только через Google.
            </p>
            <div className="mt-6 flex justify-end">
              <button onClick={onClose} className="btn-primary">Готово</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 className="font-semibold text-lg text-[#202023]">
              {hasPassword ? "Изменить пароль" : "Задать пароль для входа по email"}
            </h2>
            {!hasPassword && (
              <p className="mt-2 text-sm text-[#64625d]">
                Сейчас вход в этот аккаунт возможен только через Google. После сохранения сможешь входить и по email с паролем.
              </p>
            )}
            <div className="mt-4 space-y-3">
              {hasPassword && (
                <label className="block text-sm font-medium text-slate-700">
                  Текущий пароль
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="field mt-1"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Новый пароль
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="field mt-1"
                  placeholder="минимум 8 символов"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Повторите новый пароль
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="field mt-1"
                />
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">
                Отмена
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Сохраняю…" : "Сохранить"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
