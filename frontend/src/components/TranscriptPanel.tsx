import { useCallback, useEffect, useRef, useState } from "react";
import type { Transcript } from "../types";
import type { CaptureSource } from "../hooks/useDeepgramTranscription";
import { StatusBanner } from "./AsyncState";

const SPEAKER_COLORS: Record<string, string> = {
  "Спикер 1": "bg-indigo-100 text-indigo-700",
  "Спикер 2": "bg-emerald-100 text-emerald-700",
  "Спикер 3": "bg-amber-100 text-amber-700",
};

function speakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker] ?? "bg-slate-100 text-slate-600";
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

interface Props {
  transcripts: Transcript[];
  interimText: string;
  isCapturing: boolean;
  isConnected: boolean;
  captureSource: CaptureSource | null;
  error: string;
  pendingCount: number;
  syncStatus: string;
}

export default function TranscriptPanel({
  transcripts,
  interimText,
  isCapturing,
  isConnected,
  captureSource,
  error,
  pendingCount,
  syncStatus,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setHasNewBelow(false);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    isNearBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  // Only follow new transcript/interim text automatically while the reader
  // was already at (or near) the bottom — otherwise a manager scrolling up
  // mid-call to re-read something gets yanked back down on every new line.
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewBelow(true);
    }
  }, [transcripts.length, interimText]);

  const statusLabel = isConnected
    ? captureSource === "system"
      ? "Zoom — запись"
      : "Микрофон — запись"
    : isCapturing
    ? "Подключение..."
    : null;

  return (
    <div className="relative flex flex-col h-full bg-white border border-[#deddd8] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eceae5] bg-[#faf9f6]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Транскрипция</span>
          {statusLabel && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-[#eee9f8] text-[#6147a7]">
              <span className="w-1.5 h-1.5 bg-[#8b67df] rounded-full animate-pulse-dot" />
              {statusLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-600">
          {pendingCount > 0 ? `${pendingCount} синхронизируется` : `${transcripts.length} фрагм.`}
        </span>
      </div>

      {/* Body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0"
      >
        {transcripts.length === 0 && !interimText ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-slate-500 text-sm font-medium">
              Транскрипт появится здесь во время записи
            </p>
            <p className="text-slate-600 text-xs mt-1 max-w-xs">
              Поддерживается смешанная речь: русский и английский в одном разговоре
            </p>
          </div>
        ) : (
          <>
            {transcripts.map((t) => (
              <div key={t.client_segment_id || t.id} className="flex gap-2 items-start animate-fade-in">
                <span className="text-xs text-slate-600 mt-0.5 shrink-0 tabular-nums w-16">
                  {formatTime(t.timestamp)}
                </span>
                <div className="flex-1 min-w-0">
                  {t.speaker && (
                    <span
                      className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded mb-1 ${speakerColor(t.speaker)}`}
                    >
                      {t.speaker}
                    </span>
                  )}
                  <p className="text-sm text-slate-800 leading-relaxed">{t.text}</p>
                </div>
              </div>
            ))}
            {interimText && (
              <div className="flex gap-2 items-start">
                <span className="text-xs text-slate-300 mt-0.5 w-16 tabular-nums">···</span>
                <p className="text-sm text-slate-600 italic leading-relaxed">{interimText}</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* "Jump to latest" pill — only shown once the reader has scrolled up
          and new content has arrived below, so we never auto-scroll out
          from under them. */}
      {hasNewBelow && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-20 right-4 min-h-11 inline-flex items-center gap-1.5 px-3.5 rounded-full bg-[#242426] text-white text-xs font-medium shadow-lg hover:bg-black transition animate-fade-in"
        >
          Новые фрагменты ↓
        </button>
      )}

      {/* Error / sync status */}
      {error ? (
        <StatusBanner tone="error" message={error} />
      ) : syncStatus ? (
        <StatusBanner tone="warning" message={syncStatus} />
      ) : null}

      <div className="px-4 py-3 border-t border-[#eceae5] bg-[#faf9f6]">
        <span className="text-xs text-slate-600">
          {pendingCount > 0
            ? `Текст защищён локально · ожидают отправки: ${pendingCount}`
            : "Все фрагменты сохранены"}
        </span>
      </div>
    </div>
  );
}
