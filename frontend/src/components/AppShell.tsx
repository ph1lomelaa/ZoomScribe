import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SetPasswordModal from "./SetPasswordModal";

const nav = [
  { to: "/", label: "Обзор", icon: "home", end: true },
  { to: "/notes", label: "Конспекты", icon: "notes" },
  { to: "/new", label: "Новый конспект", icon: "plus" },
  { to: "/guide", label: "Инструкция", icon: "guide" },
  { to: "/admin", label: "Админ", icon: "admin", adminOnly: true },
];

function NavIcon({ name }: { name: string }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (name === "home") return <svg {...common}><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5M9 21v-6h6v6"/></svg>;
  if (name === "notes") return <svg {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "admin") return <svg {...common}><path d="M12 3l7 3v5c0 4.5-2.9 8.4-7 10-4.1-1.6-7-5.5-7-10V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.6 1.9c-.9.6-1.4 1.1-1.4 2.1M12 17h.01"/></svg>;
}

function LogoMark() {
  return (
    <svg width="38" height="32" viewBox="0 0 42 34" fill="none" aria-hidden="true">
      <path d="M12 27.5h19.5a7 7 0 0 0 .4-14 11 11 0 0 0-20.7 2.2A6 6 0 0 0 12 27.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="9" cy="5" r="2.2" fill="currentColor" />
      <circle cx="3" cy="11" r="1.7" fill="currentColor" />
      <circle cx="17" cy="2.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function SidebarContent({ close, onOpenPasswordModal }: { close?: () => void; onOpenPasswordModal: () => void }) {
  const { manager, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const initials = manager?.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("") || "ZS";
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  return (
    <>
      <div className="h-20 px-5 flex items-center border-b border-[#e4e2dc] text-[#d19d00]">
        <LogoMark />
        <div className="ml-3">
          <div className="font-semibold text-[#202023] tracking-tight">ZoomScribe</div>
          <div className="text-[11px] text-[#898780]">Meeting notes</div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.filter((item) => !item.adminOnly || isAdmin).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={close}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium transition ${
                isActive ? "bg-[#242426] text-white" : "text-[#5e5c57] hover:text-[#202023] hover:bg-[#eeece7]"
              }`
            }
          >
            <span className="w-6 grid place-items-center"><NavIcon name={item.icon} /></span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div ref={accountRef} className="relative mx-3 mb-5 border-t border-[#e4e2dc] pt-3">
        {accountOpen && (
          <div role="menu" className="absolute bottom-[calc(100%+.5rem)] inset-x-0 rounded-lg border border-[#deddd8] bg-white p-1.5 shadow-[0_14px_36px_rgba(32,32,35,.14)] animate-fade-in">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setAccountOpen(false); onOpenPasswordModal(); close?.(); }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[#363638] hover:bg-[#eeece7]"
            >
              {manager?.has_password ? "Изменить пароль" : "Задать пароль"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={async () => { await signOut(); navigate("/login"); close?.(); }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[#8e3d34] hover:bg-[#fbf0ee]"
            >
              <span aria-hidden="true">↪</span>
              Выйти из аккаунта
            </button>
          </div>
        )}
        <button
          type="button"
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          onClick={() => setAccountOpen((value) => !value)}
          className="flex min-h-14 w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-[#efede8] transition"
        >
          <div className="w-9 h-9 rounded-full bg-[#e9e6df] text-[#29292b] grid place-items-center text-xs font-semibold">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-[#202023] truncate">{manager?.full_name}</div>
            <div className="text-[11px] text-[#898780] truncate">{manager?.email}</div>
          </div>
          <span className={`text-[#64625d] transition-transform ${accountOpen ? "rotate-180" : ""}`} aria-hidden="true">⌃</span>
        </button>
      </div>
    </>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[#f8f7f3]">
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-60 bg-[#fbfaf7] border-r border-[#dfddd7] flex-col">
        <SidebarContent onOpenPasswordModal={() => setPasswordModalOpen(true)} />
      </aside>
      <header className="md:hidden sticky top-0 z-40 h-16 px-4 bg-[#fbfaf7] border-b border-[#dfddd7] flex items-center justify-between">
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          className="w-11 h-11 rounded-full border border-[#d9d7d1] text-xl"
        >
          ☰
        </button>
        <span className="font-semibold text-[#202023]">ZoomScribe</span>
        <NavLink
          to="/new"
          aria-label="Новый конспект"
          className="w-11 h-11 rounded-full bg-[#242426] text-white grid place-items-center text-xl"
        >
          +
        </NavLink>
      </header>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button aria-label="Закрыть меню" className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-[#fbfaf7] flex flex-col animate-slide-up">
            <SidebarContent close={() => setOpen(false)} onOpenPasswordModal={() => setPasswordModalOpen(true)} />
          </aside>
        </div>
      )}
      {passwordModalOpen && <SetPasswordModal onClose={() => setPasswordModalOpen(false)} />}
      <main className="workspace-paper md:pl-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
