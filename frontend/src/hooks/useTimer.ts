import { useRef, useState, useCallback, useEffect } from "react";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function useTimer(initialSeconds = 0) {
  const [elapsedSeconds, setElapsedSeconds] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const accumulatedRef = useRef(initialSeconds);
  const startedAtRef = useRef<number | null>(null);

  const update = useCallback(() => {
    if (startedAtRef.current === null) return;
    setElapsedSeconds(
      accumulatedRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000),
    );
  }, []);

  const start = useCallback((fromSeconds?: number) => {
    if (runningRef.current) return;
    if (fromSeconds !== undefined) {
      accumulatedRef.current = Math.max(0, fromSeconds);
      setElapsedSeconds(accumulatedRef.current);
    }
    runningRef.current = true;
    startedAtRef.current = Date.now();
    intervalRef.current = setInterval(update, 1000);
  }, [update]);

  const stop = useCallback(() => {
    if (runningRef.current && startedAtRef.current !== null) {
      accumulatedRef.current += Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(accumulatedRef.current);
    }
    runningRef.current = false;
    startedAtRef.current = null;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return accumulatedRef.current;
  }, []);

  const reset = useCallback(() => {
    stop();
    accumulatedRef.current = 0;
    setElapsedSeconds(0);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    elapsedSeconds,
    start,
    stop,
    reset,
    formatted: formatTime(elapsedSeconds),
  };
}
