import { useEffect, useRef, useState } from "react";
import type { ManagerFilterOption } from "../hooks/useManagerFilter";

interface Props {
  options: ManagerFilterOption[];
  selectedManagerId: number | null;
  onChange: (managerId: number | null) => void;
}

// Not three buttons — one filter icon that opens a dropdown with "Свои",
// "Все", and each manager. Renders nothing when there's nothing to filter
// (non-admin: options is empty, per useManagerFilter).
export default function ManagerFilterDropdown({ options, selectedManagerId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (options.length === 0) return null;

  const current = options.find((option) => option.value === selectedManagerId) ?? options[0];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Фильтр по менеджеру: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 inline-flex items-center gap-2 rounded-full border border-[#d9d7d1] bg-white px-4 text-sm font-medium text-[#363638] transition hover:bg-[#f2f0eb]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {current.label}
        <span className={`text-[#64625d] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">⌃</span>
      </button>
      {open && (
        <div role="menu" className="absolute z-20 mt-2 min-w-[14rem] rounded-lg border border-[#deddd8] bg-white p-1.5 shadow-[0_14px_36px_rgba(32,32,35,.14)] animate-fade-in">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="menuitem"
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`flex w-full min-h-11 items-center rounded-md px-3 text-left text-sm transition ${
                option.value === selectedManagerId
                  ? "bg-[#eee9f8] text-[#6147a7] font-medium"
                  : "text-[#363638] hover:bg-[#f2f0eb]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
