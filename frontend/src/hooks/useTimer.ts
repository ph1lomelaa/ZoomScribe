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

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
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
