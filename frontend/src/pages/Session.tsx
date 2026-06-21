import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  addTranscript, endSession, generateLiveSummary, generateNote, getSession, heartbeat,
} from "../api/client";
import type { SessionDetail, Transcript } from "../types";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useDeepgramTranscription, hasDeepgramKey } from "../hooks/useDeepgramTranscription";
import { useTimer } from "../hooks/useTimer";
import RecordingCard from "../components/RecordingCard";
import TranscriptPanel from "../components/TranscriptPanel";
import AiSidebar from "../components/AiSidebar";
import { ErrorState } from "../components/AsyncState";
import { renderMarkdown } from "../utils/markdown";
import { readTextStream } from "../utils/readStream";
import {
  createClientSegmentId, enqueueTranscript, readTranscriptOutbox,
  removeTranscriptFromOutbox, type PendingTranscript,
} from "../utils/transcriptOutbox";

const AUTO_SUMMARY_INTERVAL_MS = 2 * 60 * 1000;
const AUTO_SUMMARY_MIN_SEGMENTS = 5;

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionId = Number(id);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [interimText, setInterimText] = useState("");
  const [interimSpeaker, setInterimSpeaker] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioStatus, setAudioStatus] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finalNoteText, setFinalNoteText] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState("");
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  const [returnedFromBackground, setReturnedFromBackground] = useState(false);

  const timer = useTimer();
  const lastSummaryIndexRef = useRef(0);
  const lastSummaryTimeRef = useRef(0);
  const transcriptsRef = useRef<Transcript[]>([]);
  const interimTextRef = useRef("");
  const interimSpeakerRef = useRef<string | null>(null);
  const savingInterimRef = useRef(false);
  const sequenceRef = useRef(0);
  const flushPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    interimTextRef.current = interimText;
  }, [interimText]);

  useEffect(() => {
    interimSpeakerRef.current = interimSpeaker;
  }, [interimSpeaker]);

  // ── Shared callbacks ────────────────────────────────────────────────────────

  const flushOutbox = useCallback((): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const task = (async () => {
      const queued = readTranscriptOutbox(sessionId);
      setPendingCount(queued.length);
      for (const item of queued) {
        try {
          const saved = await addTranscript(
            sessionId,
            item.text,
            item.timestamp,
            item.speaker ?? undefined,
            item.clientSegmentId,
            item.sequenceNo,
          );
          removeTranscriptFromOutbox(sessionId, item.clientSegmentId);
          setTranscripts((current) => {
            const index = current.findIndex(
              (entry) => entry.client_segment_id === item.clientSegmentId,
            );
            const next = index >= 0
              ? current.map((entry, position) => position === index ? saved : entry)
              : [...current, saved];
            return next.sort(
              (a, b) => (a.sequence_no ?? a.id) - (b.sequence_no ?? b.id),
            );
          });
          setSyncStatus("");
          setPendingCount(readTranscriptOutbox(sessionId).length);
        } catch (err) {
          console.error("Transcript sync error:", err);
          setSyncStatus("Нет связи с сервером · текст сохранён на этом устройстве");
          break;
        }
      }
    })();
    flushPromiseRef.current = task;
    void task.finally(() => {
      if (flushPromiseRef.current === task) flushPromiseRef.current = null;
    });
    return task;
  }, [sessionId]);

  const handleFinalResult = useCallback(
    async (text: string, speaker: string | null, timestamp: string) => {
      const item: PendingTranscript = {
        clientSegmentId: createClientSegmentId(sessionId),
        text: text.trim(),
        timestamp,
        speaker,
        sequenceNo: sequenceRef.current++,
      };
      enqueueTranscript(sessionId, item);
      setPendingCount(readTranscriptOutbox(sessionId).length);
      const optimistic: Transcript = {
        id: -(item.sequenceNo + 1),
        session_id: sessionId,
        text: item.text,
        timestamp: item.timestamp,
        speaker: item.speaker,
        client_segment_id: item.clientSegmentId,
        sequence_no: item.sequenceNo,
      };
      setTranscripts((current) => current.some(
        (entry) => entry.client_segment_id === item.clientSegmentId,
      ) ? current : [...current, optimistic]);
      try {
        await flushOutbox();
      } catch { /* The durable outbox retries automatically. */ }
    },
    [flushOutbox, sessionId]
  );

  const handleInterim = useCallback((text: string, speaker?: string | null) => {
    interimTextRef.current = text;
    interimSpeakerRef.current = speaker ?? null;
    setInterimText(text);
    setInterimSpeaker(speaker ?? null);
  }, []);
  const handleError = useCallback((msg: string) => setError(msg), []);

  const savePendingInterim = useCallback(async () => {
    const text = interimTextRef.current.trim();
    if (!text || savingInterimRef.current) return;

    savingInterimRef.current = true;
    try {
      await handleFinalResult(
        text,
        interimSpeakerRef.current,
        new Date().toISOString(),
      );
      setInterimText("");
      setInterimSpeaker(null);
      interimTextRef.current = "";
      interimSpeakerRef.current = null;
    } finally {
      savingInterimRef.current = false;
    }
  }, [handleFinalResult]);

  // ── Deepgram hook (system audio or mic via Deepgram) ───────────────────────
  const deepgram = useDeepgramTranscription({
    onFinal: handleFinalResult,
    onInterim: handleInterim,
    onError: handleError,
    onAudioLevel: setAudioLevel,
    onAudioStatus: setAudioStatus,
    onSourceStopped: () => {
      void savePendingInterim();
      setError("Захват звука остановлен. Сохранённый текст не потерян.");
    },
    onVisibilityChange: (hidden) => {
      if (hidden) setReturnedFromBackground(false);
      else setReturnedFromBackground(true);
    },
  });

  // ── Web Speech API hook (mic fallback when no Deepgram key) ────────────────
  const speechOnFinal = useCallback(
    (text: string, timestamp: string) => handleFinalResult(text, null, timestamp),
    [handleFinalResult]
  );

  const speech = useSpeechRecognition({
    lang: "ru-RU",
    onFinalResult: speechOnFinal,
    onInterimResult: handleInterim,
    onError: handleError,
  });

  // ── Unified state ───────────────────────────────────────────────────────────
  const isCapturing = deepgram.isCapturing || speech.isRecording;
  const isConnected = deepgram.isConnected;
  const captureSource = deepgram.captureSource;

  async function handleStartCapture() {
    setError("");
    setAudioLevel(0);
    setAudioStatus("");
    await deepgram.stop();
    speech.stop();
    await deepgram.start("system");
  }

  async function handleStartMic(deviceId?: string) {
    setError("");
    setAudioLevel(0);
    setAudioStatus("");
    await deepgram.stop();
    speech.stop();
    if (hasDeepgramKey) {
      await deepgram.start("mic", deviceId);
    } else {
      speech.start();
    }
  }

  async function stopAndFlush() {
    if (deepgram.isCapturing) await deepgram.stop();
    if (speech.isRecording) {
      await savePendingInterim();
      speech.stop();
    }
    await flushOutbox();
  }

  async function handleStop() {
    await stopAndFlush();
    setAudioLevel(0);
    setAudioStatus("");
  }

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    getSession(sessionId).then((data) => {
      const pending = readTranscriptOutbox(sessionId);
      const serverIds = new Set((data.transcripts || []).map((item) => item.client_segment_id));
      const optimistic = pending
        .filter((item) => !serverIds.has(item.clientSegmentId))
        .map((item): Transcript => ({
          id: -(item.sequenceNo + 1), session_id: sessionId, text: item.text,
          timestamp: item.timestamp, speaker: item.speaker,
          client_segment_id: item.clientSegmentId, sequence_no: item.sequenceNo,
        }));
      const merged = [...(data.transcripts || []), ...optimistic].sort(
        (a, b) => (a.sequence_no ?? a.id) - (b.sequence_no ?? b.id),
      );
      sequenceRef.current = Math.max(
        0,
        ...merged.map((item) => (item.sequence_no ?? -1) + 1),
      );
      setSession(data);
      setTranscripts(merged);
      setPendingCount(pending.length);
      if (data.note) setAiSummary(data.note.summary_markdown);
      if (data.status === "active") {
        const elapsed = Math.max(
          data.duration_seconds || 0,
          Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000),
        );
        timer.start(Number.isFinite(elapsed) ? elapsed : 0);
      }
      void flushOutbox();
    }).catch((err) => setError((err as Error).message));
    return () => {
      timer.stop();
      deepgram.stop();
      speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const retry = () => void flushOutbox();
    window.addEventListener("online", retry);
    const interval = window.setInterval(retry, 5000);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(interval);
    };
  }, [flushOutbox]);

  // Instant offline/online feedback — without this, the existing
  // sync-status banner only appears once the next periodic flush attempt
  // fails (up to 5s later), instead of the moment connectivity actually drops.
  useEffect(() => {
    const goOffline = () => setSyncStatus("Нет подключения к интернету · текст сохраняется локально");
    const goOnline = () => void flushOutbox();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [flushOutbox]);

  // Auto-dismiss the "tab was backgrounded" notice so it doesn't linger for
  // the rest of the call once the user has seen it.
  useEffect(() => {
    if (!returnedFromBackground) return;
    const timeout = window.setTimeout(() => setReturnedFromBackground(false), 8000);
    return () => window.clearTimeout(timeout);
  }, [returnedFromBackground]);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    const send = () => heartbeat(sessionId).catch(() => undefined);
    send();
    const interval = window.setInterval(send, 20_000);
    return () => window.clearInterval(interval);
  }, [session, sessionId]);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (!isCapturing) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [isCapturing]);

  // ── Auto AI summary every 2 min ─────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const current = transcriptsRef.current;
      const newSince = current.length - lastSummaryIndexRef.current;
      const timeSince = Date.now() - lastSummaryTimeRef.current;

      if (
        newSince >= AUTO_SUMMARY_MIN_SEGMENTS &&
        timeSince >= AUTO_SUMMARY_INTERVAL_MS &&
        !isAiStreaming
      ) {
        lastSummaryIndexRef.current = current.length;
        lastSummaryTimeRef.current = Date.now();
        setIsAiStreaming(true);
        try {
          const response = await generateLiveSummary(sessionId);
          await readTextStream(response, setAiSummary);
        } catch (err) {
          console.error("Auto-summary error:", err);
        } finally {
          setIsAiStreaming(false);
        }
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [sessionId, isAiStreaming]);

  // ── Finish session ──────────────────────────────────────────────────────────
  async function handleFinish() {
    if (transcripts.length === 0 && !confirm("Завершить сессию без транскрипта?")) return;
    if (transcripts.length > 0 && !confirm("Завершить сессию и сгенерировать конспект?")) return;

    await stopAndFlush();
    if (readTranscriptOutbox(sessionId).length > 0) {
      setError("Не удалось отправить все фрагменты. Проверьте сеть и повторите завершение.");
      return;
    }
    const durationSeconds = timer.stop();
    setFinishing(true);

    try {
      await endSession(sessionId, durationSeconds);
      const response = await generateNote(sessionId);
      await readTextStream(response, setFinalNoteText);

      const updated = await getSession(sessionId);
      if (updated.note) navigate(`/notes/${updated.note.id}`);
      else navigate("/");
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Не удалось завершить созвон");
      setFinishing(false);
    }
  }

  async function handleBack() {
    if (transcripts.length > 0 && !confirm("Выйти? Прогресс сессии сохранён в базе.")) return;
    await stopAndFlush();
    timer.stop();
    navigate("/");
  }

  if (!session) {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] md:min-h-screen flex flex-col bg-surface">
      {/* Top bar */}
      <div className="sticky top-16 md:top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button
            onClick={handleBack}
            aria-label="Назад к списку созвонов"
            className="no-print shrink-0 w-11 h-11 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            ←
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-base">{session.country_flag}</span>
            <span className="font-semibold text-slate-900 truncate">{session.student_name}</span>
            <span className="text-slate-500 text-sm hidden sm:block">·</span>
            <span className="text-slate-500 text-sm hidden sm:block truncate">{session.manager_name}</span>
          </div>

          {session.zoom_link && (
            <span
              className="hidden xl:block max-w-xs truncate text-xs text-slate-600"
              title={session.zoom_link}
            >
              {session.zoom_link}
            </span>
          )}

          <span className="shrink-0 font-mono text-lg font-semibold text-slate-700 tabular-nums">
            {timer.formatted}
          </span>

          <button
            onClick={handleFinish}
            disabled={finishing}
            className="no-print shrink-0 whitespace-nowrap min-h-11 inline-flex items-center justify-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-60"
          >
            Завершить
          </button>
        </div>
      </div>

      {/* Two-column layout. Bottom padding on <lg makes room for the fixed
          AI summary sheet's collapsed handle bar (see AiSidebar). */}
      <div className="flex-1 lg:flex-none max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-4 pb-20 lg:pb-4 grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)_19rem] gap-4 lg:h-[min(48rem,calc(100dvh-5.5rem))] lg:min-h-[34rem]">
        <div className="h-[32rem] lg:h-full min-h-0">
          <RecordingCard
            isCapturing={isCapturing}
            isConnected={isConnected}
            captureSource={captureSource}
            segmentCount={transcripts.length}
            audioLevel={audioLevel}
            audioStatus={audioStatus}
            onStartCapture={handleStartCapture}
            onStartMic={handleStartMic}
            onStop={handleStop}
            error={error}
            returnedFromBackground={returnedFromBackground}
          />
        </div>
        <div className="h-[34rem] lg:h-full min-h-0">
          <TranscriptPanel
            transcripts={transcripts}
            interimText={interimText}
            isCapturing={isCapturing}
            isConnected={isConnected}
            captureSource={captureSource}
            error={error}
            pendingCount={pendingCount}
            syncStatus={syncStatus}
          />
        </div>
        {/* On <lg this wrapper carries no height of its own — AiSidebar is
            position:fixed there (bottom sheet) and ignores its parent's box.
            On lg+ it reverts to a normal grid column at the original height. */}
        <div className="h-0 lg:h-full lg:min-h-0">
          <AiSidebar
            summaryHtml={aiSummary}
            isStreaming={isAiStreaming}
            isOpen={aiSheetOpen}
            onToggleOpen={() => setAiSheetOpen((v) => !v)}
          />
        </div>
      </div>

      {/* Finishing overlay */}
      {finishing && (
        <div className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="font-semibold text-slate-800">Формирую конспект...</span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!finalNoteText && (
                <div className="flex gap-1 py-4">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-2 h-2 bg-indigo-400 rounded-full animate-thinking-dot"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
              )}
              {finalNoteText && (
                <div
                  className="prose-custom text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(finalNoteText) }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
