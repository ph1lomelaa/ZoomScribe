import { useRef, useState, useCallback, useEffect } from "react";

const DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen";
const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY ?? "";

export type CaptureSource = "system" | "mic";

interface Options {
  onFinal: (text: string, speaker: string | null, timestamp: string) => void;
  onInterim: (text: string, speaker?: string | null) => void;
  onError: (msg: string) => void;
  onAudioLevel?: (level: number) => void;
  onAudioStatus?: (status: string) => void;
  onSourceStopped?: () => void;
}

interface DeepgramWord {
  word: string;
  speaker?: number;
}

interface DeepgramResult {
  type: string;
  is_final: boolean;
  speech_final: boolean;
  channel_index?: [number, number];
  channel: {
    alternatives: Array<{
      transcript: string;
      words: DeepgramWord[];
    }>;
  };
}

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function rms(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}

function dominantSpeaker(words: DeepgramWord[]): string | null {
  if (!words?.length) return null;
  const counts: Record<number, number> = {};
  for (const w of words) {
    const s = w.speaker ?? 0;
    counts[s] = (counts[s] || 0) + 1;
  }
  const top = Number(
    Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]
  );
  return `Спикер ${top + 1}`;
}

export const hasDeepgramKey = Boolean(DEEPGRAM_KEY);

export function useDeepgramTranscription({
  onFinal,
  onInterim,
  onError,
  onAudioLevel,
  onAudioStatus,
  onSourceStopped,
}: Options) {
  const [isConnected, setIsConnected] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureSource, setCaptureSource] = useState<CaptureSource | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    setIsCapturing(false);
    setIsConnected(false);
    setCaptureSource(null);
    onInterim("");
    onAudioLevel?.(0);
    onAudioStatus?.("");

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [onInterim]);

  const start = useCallback(
    async (source: CaptureSource, deviceId?: string) => {
      if (!DEEPGRAM_KEY) {
        onError("Не задан VITE_DEEPGRAM_API_KEY в frontend/.env");
        return;
      }

      // Safari doesn't support getDisplayMedia with audio
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (source === "system" && isSafari) {
        onError("__SAFARI__");
        return;
      }

      cleanup();

      let stream: MediaStream;
      try {
        if (source === "system") {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            } as MediaTrackConstraints,
          });

          if (stream.getAudioTracks().length === 0) {
            stream.getTracks().forEach((t) => t.stop());
            onError("__NO_AUDIO__");
            return;
          }
        } else {
          const audioConstraints: MediaTrackConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
          if (deviceId) (audioConstraints as Record<string, unknown>).deviceId = { exact: deviceId };
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        }
      } catch (err) {
        const name = (err as DOMException).name ?? "";
        const msg  = (err as DOMException).message ?? "";
        const isBusy =
          name === "NotReadableError" ||
          name === "TrackStartError" ||
          msg.includes("Could not start") ||
          msg.includes("in use") ||
          msg.includes("busy");
        const isDenied =
          name === "NotAllowedError" ||
          name === "PermissionDeniedError" ||
          msg.includes("denied") ||
          msg.includes("Permission");

        if (source === "mic" && isBusy) {
          // Mic is held by Zoom — guide user to system audio
          onError("__MIC_BUSY__");
        } else if (isDenied) {
          onError(
            source === "system"
              ? "Доступ к экрану запрещён — разрешите захват в браузере."
              : "Доступ к микрофону запрещён — разрешите в настройках браузера."
          );
        } else if (name === "NotFoundError") {
          onError("Микрофон не найден — проверьте подключение.");
        } else {
          onError(`Ошибка захвата: ${name || msg}`);
        }
        return;
      }

      streamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];
      onAudioStatus?.(
        audioTrack
          ? `track=${audioTrack.readyState}, muted=${audioTrack.muted ? "yes" : "no"}`
          : "audio track отсутствует"
      );

      // Build Deepgram URL
      const params = new URLSearchParams({
        model: "nova-3",
        language: "multi",
        punctuate: "true",
        smart_format: "true",   // formats numbers, dates, currency automatically
        interim_results: "true",
        endpointing: "50",
        encoding: "linear16",
        sample_rate: "16000",
        channels: "1",
        utterance_end_ms: "1000",
        filler_words: "false",  // strip "uh", "um", "э-э" etc.
        diarize: "true",
      });

      // Browser WebSockets can't set headers — Deepgram accepts token as subprotocol
      const ws = new WebSocket(`${DEEPGRAM_WS}?${params}`, ["token", DEEPGRAM_KEY]);
      wsRef.current = ws;

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setIsConnected(true);
        setIsCapturing(true);
        setCaptureSource(source);
        activeRef.current = true;

        // Audio pipeline: MediaStream → AudioContext (16 kHz) → PCM Int16 chunks → WebSocket
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        audioCtx.resume().catch(() => {});

        const processor = audioCtx.createScriptProcessor(4096, 2, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!activeRef.current || ws.readyState !== WebSocket.OPEN) return;
          for (let channel = 0; channel < e.outputBuffer.numberOfChannels; channel++) {
            e.outputBuffer.getChannelData(channel).fill(0);
          }
          const left = e.inputBuffer.getChannelData(0);
          const numChannels = e.inputBuffer.numberOfChannels;
          let mixed: Float32Array;
          if (numChannels >= 2) {
            const right = e.inputBuffer.getChannelData(1);
            mixed = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) mixed[i] = (left[i] + right[i]) / 2;
          } else {
            mixed = left;
          }

          onAudioLevel?.(rms(mixed));
          ws.send(float32ToInt16(mixed).buffer);
        };

        if (source === "system") {
          const tabSource = audioCtx.createMediaStreamSource(stream);
          const tabGain = audioCtx.createGain();
          tabGain.gain.value = 2.5;
          tabSource.connect(tabGain);
          tabGain.connect(processor);

          navigator.mediaDevices
            .getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            })
            .then((micStream) => {
              if (!activeRef.current || !audioCtxRef.current || !processorRef.current) {
                micStream.getTracks().forEach((t) => t.stop());
                return;
              }
              micStreamRef.current = micStream;
              const micSource = audioCtxRef.current.createMediaStreamSource(micStream);
              const micGain = audioCtxRef.current.createGain();
              micGain.gain.value = 1.2;
              micSource.connect(micGain);
              micGain.connect(processorRef.current);
              const micTrack = micStream.getAudioTracks()[0];
              onAudioStatus?.(
                `tab=${audioTrack?.readyState ?? "none"}, muted=${audioTrack?.muted ? "yes" : "no"}, mic=${micTrack ? "on" : "off"}`
              );
            })
            .catch(() => {
              onAudioStatus?.(
                `tab=${audioTrack?.readyState ?? "none"}, muted=${audioTrack?.muted ? "yes" : "no"}, mic=off`
              );
            });
        } else {
          const micSource = audioCtx.createMediaStreamSource(stream);
          const micGain = audioCtx.createGain();
          micGain.gain.value = 1.0;
          micSource.connect(micGain);
          micGain.connect(processor);
        }

        // ScriptProcessor must be connected to a live destination in Chromium.
        // Zero gain keeps the graph pulled without playing captured audio back.
        const silentOutput = audioCtx.createGain();
        silentOutput.gain.value = 0;
        processor.connect(silentOutput);
        silentOutput.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as DeepgramResult;
          if (data.type !== "Results") return;

          const alt = data.channel?.alternatives?.[0];
          if (!alt?.transcript?.trim()) return;

          if (data.is_final) {
            const channelIndex = data.channel_index?.[0];
            const speaker =
              channelIndex === 0
                ? "Студент"
                : channelIndex === 1
                ? "Менеджер"
                : dominantSpeaker(alt.words);
            onFinal(alt.transcript.trim(), speaker, new Date().toISOString());
            onInterim("");
          } else {
            const channelIndex = data.channel_index?.[0];
            const speaker =
              channelIndex === 0
                ? "Студент"
                : channelIndex === 1
                ? "Менеджер"
                : null;
            onInterim(alt.transcript, speaker);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        onError("Deepgram не принял соединение. Ждём код закрытия...");
      };

      ws.onclose = (e) => {
        setIsConnected(false);
        if (activeRef.current) {
          if (e.code === 1008) {
            onError("Неверный API ключ Deepgram.");
          } else if (e.code === 1011) {
            onError("__NO_AUDIO__");
          } else if (e.code !== 1000) {
            onError(`Соединение прервано (${e.code}).`);
          }
          cleanup();
        }
      };

      // If the user stops sharing screen/tab, the track ends
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("mute", () => {
          onAudioStatus?.(`track=${track.readyState}, muted=yes`);
        });
        track.addEventListener("unmute", () => {
          onAudioStatus?.(`track=${track.readyState}, muted=no`);
        });
        track.addEventListener("ended", () => {
          cleanup();
          onSourceStopped?.();
        });
      });
    },
    [cleanup, onFinal, onInterim, onError, onAudioLevel, onAudioStatus, onSourceStopped]
  );

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isCapturing,
    captureSource,
    start,
    stop,
  };
}
