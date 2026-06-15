import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSession, endSession, addTranscript, generateNote } from "../api/client";
import type { SessionDetail, Transcript } from "../types";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useDeepgramTranscription, hasDeepgramKey } from "../hooks/useDeepgramTranscription";
import { useTimer } from "../hooks/useTimer";
import RecordingCard from "../components/RecordingCard";
import TranscriptPanel from "../components/TranscriptPanel";
import AiSidebar from "../components/AiSidebar";
import { renderMarkdown } from "../utils/markdown";

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

  const timer = useTimer();
  const lastSummaryIndexRef = useRef(0);
  const lastSummaryTimeRef = useRef(0);
  const transcriptsRef = useRef<Transcript[]>([]);
  const interimTextRef = useRef("");
  const interimSpeakerRef = useRef<string | null>(null);
  const savingInterimRef = useRef(false);

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

  const handleFinalResult = useCallback(
    async (text: string, speaker: string | null, timestamp: string) => {
      try {
        const saved = await addTranscript(sessionId, text, timestamp, speaker ?? undefined);
        setTranscripts((prev) => [...prev, saved]);
      } catch (err) {
        console.error("Transcript save error:", err);
        setError("Текст распознан, но не сохранился в базе. Проверьте backend.");
      }
    },
    [sessionId]
  );

  const handleInterim = useCallback((text: string, speaker?: string | null) => {
    setInterimText(text);
    setInterimSpeaker(speaker ?? null);
  }, []);
  const handleError = useCallback((msg: string) => setError(msg), []);

  const savePendingInterim = useCallback(async () => {
    const text = interimTextRef.current.trim();
    if (!text || savingInterimRef.current) return;

    savingInterimRef.current = true;
    try {
      const saved = await addTranscript(
        sessionId,
        text,
        new Date().toISOString(),
        interimSpeakerRef.current ?? undefined
      );
      const next = [...transcriptsRef.current, saved];
      transcriptsRef.current = next;
      setTranscripts(next);
      setInterimText("");
      setInterimSpeaker(null);
      interimTextRef.current = "";
      interimSpeakerRef.current = null;
    } catch (err) {
      console.error("Interim save error:", err);
      setError("Последняя фраза распознана, но не сохранилась в базе.");
    } finally {
      savingInterimRef.current = false;
    }
  }, [sessionId]);

  // ── Deepgram hook (system audio or mic via Deepgram) ───────────────────────
  const deepgram = useDeepgramTranscription({
    onFinal: handleFinalResult,
    onInterim: handleInterim,
    onError: handleError,
    onAudioLevel: setAudioLevel,
    onAudioStatus: setAudioStatus,
    onSourceStopped: () => setError("Захват звука остановлен."),
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

  function handleStartCapture() {
    setError("");
    setAudioLevel(0);
    setAudioStatus("");
    deepgram.stop();
    speech.stop();
    deepgram.start("system");
  }

  function handleStartMic(deviceId?: string) {
    setError("");
    setAudioLevel(0);
    setAudioStatus("");
    deepgram.stop();
    speech.stop();
    if (hasDeepgramKey) {
      deepgram.start("mic", deviceId);
    } else {
      speech.start();
    }
  }

  async function handleStop() {
    await savePendingInterim();
    deepgram.stop();
    speech.stop();
    setAudioLevel(0);
    setAudioStatus("");
  }

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    getSession(sessionId).then((data) => {
      setSession(data);
      setTranscripts(data.transcripts || []);
      if (data.note) setAiSummary(data.note.summary_markdown);
      if (data.status === "active") timer.start();
    });
    return () => {
      timer.stop();
      deepgram.stop();
      speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
        const recentText = current.slice(-newSince).map((t) => t.text).join("\n");

        setIsAiStreaming(true);
        try {
          const response = await generateNote(sessionId, recentText);
          if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let summary = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              summary += decoder.decode(value, { stream: true });
              setAiSummary(summary);
            }
          }
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

    await savePendingInterim();
    deepgram.stop();
    speech.stop();
    timer.stop();
    setFinishing(true);

    await endSession(sessionId, timer.elapsedSeconds);

    const currentTranscripts = transcriptsRef.current;
    const fullTranscript = currentTranscripts.map((t) => {
      const prefix = t.speaker ? `[${t.speaker}]: ` : "";
      return `${prefix}${t.text}`;
    }).join("\n");

    try {
      const response = await generateNote(sessionId, fullTranscript);
      if (!response.body) throw new Error("No stream body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let noteText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        noteText += decoder.decode(value, { stream: true });
        setFinalNoteText(noteText);
      }

      const updated = await getSession(sessionId);
      if (updated.note) navigate(`/notes/${updated.note.id}`);
      else navigate("/");
    } catch (err) {
      console.error(err);
      setFinishing(false);
    }
  }

  function handleBack() {
    if (transcripts.length > 0 && !confirm("Выйти? Прогресс сессии сохранён в базе.")) return;
    deepgram.stop();
    speech.stop();
    timer.stop();
    navigate("/");
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="no-print w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            ←
          </button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-base">{session.country_flag}</span>
            <span className="font-semibold text-slate-900 truncate">{session.student_name}</span>
            <span className="text-slate-400 text-sm hidden sm:block">·</span>
            <span className="text-slate-500 text-sm hidden sm:block truncate">{session.manager_name}</span>
          </div>

          {session.zoom_link && (
            <span
              className="hidden lg:block max-w-xs truncate text-xs text-slate-400"
              title={session.zoom_link}
            >
              {session.zoom_link}
            </span>
          )}

          <span className="font-mono text-lg font-semibold text-slate-700 tabular-nums">
            {timer.formatted}
          </span>

          <button
            onClick={handleFinish}
            disabled={finishing}
            className="no-print flex items-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-60"
          >
            Завершить
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_20rem] gap-4 min-h-0">
        <div className="min-h-[22rem] lg:min-h-0" style={{ height: "calc(100vh - 7rem)" }}>
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
          />
        </div>
        <div className="min-h-[24rem] lg:min-h-0" style={{ height: "calc(100vh - 7rem)" }}>
          <TranscriptPanel
            transcripts={transcripts}
            interimText={interimText}
            isCapturing={isCapturing}
            isConnected={isConnected}
            captureSource={captureSource}
            error={error}
          />
        </div>
        <div className="min-h-[20rem] lg:min-h-0" style={{ height: "calc(100vh - 7rem)" }}>
          <AiSidebar summaryHtml={aiSummary} isStreaming={isAiStreaming} />
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
