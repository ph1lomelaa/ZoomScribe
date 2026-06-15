import { useRef, useState, useCallback, useEffect } from "react";

interface Options {
  lang: string;
  onFinalResult: (text: string, timestamp: string) => void;
  onInterimResult: (text: string) => void;
  onError?: (error: string) => void;
}

// Browser speech recognition type declarations
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

export function useSpeechRecognition({
  lang,
  onFinalResult,
  onInterimResult,
  onError,
}: Options) {
  const SpeechRecognitionClass =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSupported = Boolean(SpeechRecognitionClass);

  const recRef = useRef<ISpeechRecognition | null>(null);
  const isRecordingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const langRef = useRef(lang);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const createRecognition = useCallback((): ISpeechRecognition | null => {
    if (!SpeechRecognitionClass) return null;
    const rec = new SpeechRecognitionClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langRef.current;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalResult(text, new Date().toISOString());
        } else {
          interim += result[0].transcript;
        }
      }
      onInterimResult(interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        isRecordingRef.current = false;
        setIsRecording(false);
        onError?.("Нет доступа к микрофону. Разрешите доступ в настройках браузера.");
        return;
      }
      if (event.error === "no-speech") return;
      onError?.(`Ошибка распознавания: ${event.error}`);
    };

    rec.onend = () => {
      if (isRecordingRef.current) {
        setTimeout(() => {
          if (isRecordingRef.current && recRef.current) {
            try {
              recRef.current.lang = langRef.current;
              recRef.current.start();
            } catch {
              // already started
            }
          }
        }, 300);
      }
    };

    return rec;
  }, [SpeechRecognitionClass, onFinalResult, onInterimResult, onError]);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.("Ваш браузер не поддерживает распознавание речи. Попробуйте Chrome.");
      return;
    }
    if (isRecordingRef.current) return;

    const rec = createRecognition();
    if (!rec) return;
    recRef.current = rec;
    isRecordingRef.current = true;
    setIsRecording(true);
    try {
      rec.start();
    } catch {
      // already started
    }
  }, [isSupported, createRecognition, onError]);

  const stop = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    onInterimResult("");
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        // already stopped
      }
      recRef.current = null;
    }
  }, [onInterimResult]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (recRef.current) {
        try { recRef.current.stop(); } catch { /* noop */ }
      }
    };
  }, []);

  return { isRecording, isSupported, start, stop };
}
