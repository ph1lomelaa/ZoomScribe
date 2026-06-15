import { useEffect, useRef } from "react";
import type { Transcript } from "../types";
import type { CaptureSource } from "../hooks/useDeepgramTranscription";

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
}

export default function TranscriptPanel({
  transcripts,
  interimText,
  isCapturing,
  isConnected,
  captureSource,
  error,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts.length, interimText]);

  const statusLabel = isConnected
    ? captureSource === "system"
      ? "Zoom — запись"
      : "Микрофон — запись"
    : isCapturing
    ? "Подключение..."
    : null;

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Транскрипция</span>
          {statusLabel && (
            <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse-dot" />
              {statusLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">{transcripts.length} фрагм.</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
        {transcripts.length === 0 && !interimText ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-slate-500 text-sm font-medium">
              Транскрипт появится здесь во время записи
            </p>
            <p className="text-slate-400 text-xs mt-1 max-w-xs">
              Поддерживается смешанная речь: русский и английский в одном разговоре
            </p>
          </div>
        ) : (
          <>
            {transcripts.map((t) => (
              <div key={t.id} className="flex gap-2 items-start animate-fade-in">
                <span className="text-xs text-slate-400 mt-0.5 shrink-0 tabular-nums w-16">
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
                <p className="text-sm text-slate-400 italic leading-relaxed">{interimText}</p>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
        <span className="text-xs text-slate-400">{transcripts.length} сегм.</span>
      </div>
    </div>
  );
}
