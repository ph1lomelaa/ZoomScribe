import { useState, useRef, useCallback } from "react";
import { generateNote } from "../api/client";

export function useStreamingAI() {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (sessionId: number, transcript: string) => {
    if (isStreaming) return;
    setIsStreaming(true);
    setText("");

    abortRef.current = new AbortController();

    try {
      const response = await generateNote(sessionId, transcript);
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setText((prev) => prev + chunk);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Streaming error:", err);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setText("");
    setIsStreaming(false);
  }, []);

  return { text, isStreaming, stream, reset };
}
