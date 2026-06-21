import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession } from "../api/client";

export default function NewSession() {
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState("");
  const [country, setCountry] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await createSession({
        student_name: studentName,
        country,
        country_flag: "",
        zoom_link: description,
      });
      navigate(`/session/${session.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-content-narrow">
        <h1 className="page-title">Создать конспект</h1>
        <p className="page-subtitle">Заполните данные перед звонком. Ваше имя добавится автоматически из профиля.</p>
        <form onSubmit={submit} className="card mt-7 p-5 sm:p-7 space-y-5">
          <label className="block text-sm font-medium text-slate-700">Имя студента
            <input className="field mt-2" required value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Имя и фамилия" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Страна студента
            <input className="field mt-2" required value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Казахстан" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Цель или описание созвона
            <textarea className="field mt-2 min-h-28 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: первичная консультация по поступлению" />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
            <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Отмена</button>
            <button disabled={loading} className="btn-primary">{loading ? "Создаю…" : "Создать и перейти к записи"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
