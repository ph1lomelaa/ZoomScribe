export interface PendingTranscript {
  clientSegmentId: string;
  text: string;
  timestamp: string;
  speaker: string | null;
  sequenceNo: number;
}

const keyFor = (sessionId: number) => `zoomscribe:transcript-outbox:${sessionId}`;

export function readTranscriptOutbox(sessionId: number): PendingTranscript[] {
  try {
    const value = localStorage.getItem(keyFor(sessionId));
    if (!value) return [];
    const parsed = JSON.parse(value) as PendingTranscript[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTranscriptOutbox(sessionId: number, items: PendingTranscript[]) {
  if (items.length === 0) localStorage.removeItem(keyFor(sessionId));
  else localStorage.setItem(keyFor(sessionId), JSON.stringify(items));
}

export function enqueueTranscript(sessionId: number, item: PendingTranscript) {
  const current = readTranscriptOutbox(sessionId);
  if (!current.some((entry) => entry.clientSegmentId === item.clientSegmentId)) {
    writeTranscriptOutbox(sessionId, [...current, item]);
  }
}

export function removeTranscriptFromOutbox(sessionId: number, clientSegmentId: string) {
  writeTranscriptOutbox(
    sessionId,
    readTranscriptOutbox(sessionId).filter((entry) => entry.clientSegmentId !== clientSegmentId),
  );
}

export function createClientSegmentId(sessionId: number) {
  const random = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${sessionId}-${random}`;
}
