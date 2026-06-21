import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { startGoogleLogin } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { manager, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nextPath = (location.state as { from?: string } | null)?.from || "/";

  useEffect(() => {
    if (manager) navigate("/", { replace: true });
  }, [manager, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") await signUp(name, email, password);
      else await signIn(email, password);
      const destination = (location.state as { from?: string } | null)?.from || "/";
      navigate(destination, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function signInWithGoogle() {
    startGoogleLogin(nextPath);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.08fr_.92fr] bg-white">
      <section className="workspace-paper hidden lg:flex border-r border-[#deddd8] p-8 xl:p-12 flex-col relative overflow-hidden">
        <div className="relative flex items-center gap-3 font-semibold text-xl text-[#202023]">
          <span className="w-10 h-10 rounded-full bg-[#f7c948] border-2 border-[#d9aa18] text-[#202023] grid place-items-center font-serif font-semibold">Z</span>
          ZoomScribe
        </div>
        <div className="relative max-w-2xl mt-[clamp(4rem,9vh,7rem)]">
          <h1 className="font-serif text-6xl xl:text-7xl font-normal leading-[0.98] tracking-normal text-[#202023]">Разговор закончился. Конспект уже готов.</h1>
          <p className="mt-7 text-lg text-[#64625d] leading-relaxed max-w-xl">Живой транскрипт, структурированный итог и все договорённости в одном рабочем пространстве.</p>
          <div className="mt-10 max-w-md rounded-[20px] border border-[#d9d7d1] bg-white p-3 shadow-[0_18px_50px_rgba(32,32,35,.07)] rotate-[-1deg]">
            <div className="flex items-center justify-between border-b border-[#eceae5] px-3 pb-3 text-xs">
              <strong>Live transcript</strong><span className="text-[#765bc4]">● запись</span>
            </div>
            <div className="space-y-3 p-3 text-sm text-[#5d5b56]">
              <p><strong className="text-[#202023]">Менеджер</strong><br/>Зафиксируем следующий шаг и дедлайн.</p>
              <p><strong className="text-[#202023]">Студент</strong><br/>Отправлю документы до пятницы.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-8 bg-[#fff]">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 font-semibold text-xl mb-8">
            <span className="w-10 h-10 rounded-full bg-[#f7c948] border-2 border-[#d9aa18] text-[#202023] grid place-items-center font-serif font-semibold">Z</span>
            ZoomScribe
          </div>
          <h2 className="font-serif text-4xl font-normal tracking-normal text-[#202023]">{mode === "login" ? "Вход в аккаунт" : "Создать аккаунт"}</h2>
          <p className="mt-2 text-[#64625d]">{mode === "login" ? "Продолжите работу со своими конспектами" : "Личный профиль менеджера займёт меньше минуты"}</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            {mode === "register" && (
              <label className="block text-sm font-medium text-slate-700">Имя и фамилия
                <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="field mt-2" placeholder="" />
              </label>
            )}
            <label className="block text-sm font-medium text-slate-700">Email
              <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-2" placeholder="" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Пароль
              <input required minLength={8} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-2" />
            </label>
            {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button disabled={loading} className="btn-primary w-full py-3.5">
              {loading ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>
          <div className="mt-4">
            <button type="button" onClick={signInWithGoogle} className="btn-secondary w-full py-3.5">
              {mode === "login" ? "Войти через Google" : "Продолжить через Google"}
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-[#64625d]">
            {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
            <Link className="text-[#6548b4] font-medium hover:text-[#50388f]" to={mode === "login" ? "/register" : "/login"}>
              {mode === "login" ? "Регистрация" : "Войти"}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
