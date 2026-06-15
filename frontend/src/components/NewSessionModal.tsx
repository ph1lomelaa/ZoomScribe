import React, { useState } from "react";

interface Props {
  onClose: () => void;
  onCreate: (data: {
    student_name: string;
    manager_name: string;
    country: string;
    country_flag: string;
    zoom_link: string;
  }) => Promise<void>;
}

export default function NewSessionModal({ onClose, onCreate }: Props) {
  const [managerName, setManagerName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState("");
  const [callDescription, setCallDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!managerName.trim() || !firstName.trim() || !country.trim()) {
      setError("Заполните обязательные поля");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onCreate({
        student_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        manager_name: managerName.trim(),
        country: country.trim(),
        country_flag: "",
        zoom_link: callDescription.trim(),
      });
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Новая сессия</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Имя менеджера <span className="text-red-500">*</span>
            </label>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder=""
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Имя ученика <span className="text-red-500">*</span>
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder=""
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Фамилия
              </label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder=""
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Страна <span className="text-red-500">*</span>
            </label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder=""
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Описание созвона
            </label>
            <textarea
              value={callDescription}
              onChange={(e) => setCallDescription(e.target.value)}
              rows={3}
              placeholder=""
              className="w-full resize-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-700 rounded-lg py-2.5 text-sm font-medium hover:bg-slate-50 transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-600 transition disabled:opacity-60"
            >
              {loading ? "Создаём..." : "Начать конспектирование"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
