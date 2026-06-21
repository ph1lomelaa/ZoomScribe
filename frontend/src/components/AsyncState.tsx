import type { ReactNode } from "react";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/** Shared "request failed" state — used wherever a list/page fetch can fail,
 * so a network error is never silently rendered as an empty list. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="card w-full py-10 px-5 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-red-50 text-red-500 grid place-items-center text-2xl">
        !
      </div>
      <h3 className="mt-4 font-semibold text-[#202023]">Не удалось загрузить данные</h3>
      <p className="mt-2 text-sm text-[#64625d] break-words">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-5 min-w-[9rem]">
          Повторить
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="card w-full py-10 px-5 text-center">
      <h3 className="font-semibold text-[#202023]">{title}</h3>
      <p className="mt-2 text-sm text-[#64625d]">{description}</p>
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`card h-40 animate-pulse ${i >= 2 ? "hidden xl:block" : ""}`}
        />
      ))}
    </div>
  );
}

export function LoadingList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl h-24 animate-pulse border border-slate-100" />
      ))}
    </div>
  );
}

interface StatusBannerProps {
  tone: "error" | "warning";
  message: string;
}

/** Inline connectivity/sync banner — same look wherever a "this needs your
 * attention but isn't fatal" message is shown (sync errors, offline mode). */
export function StatusBanner({ tone, message }: StatusBannerProps) {
  return (
    <div className="px-4 py-2 bg-red-50 border-t border-red-100">
      <p className={`text-xs ${tone === "error" ? "text-red-600" : "text-amber-700"}`}>{message}</p>
    </div>
  );
}
