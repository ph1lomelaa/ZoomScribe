# ZoomScribe: production architecture

## Recording path

Each manager records in their own browser. Audio is sent directly to Deepgram over a dedicated WebSocket authenticated by a short-lived server-issued token. This keeps high-volume audio traffic away from the ZoomScribe API and lets managers record concurrently without sharing process state.

Final transcript segments are written to a local browser outbox before the API request. Every segment has a unique client ID; retries are idempotent, so a temporary network failure neither loses text nor creates duplicates. The backend stores segments incrementally instead of waiting for the end of a 30–40 minute call.

The browser keeps up to five minutes of PCM audio in memory while reconnecting to Deepgram. It retries with exponential backoff and obtains a fresh temporary token on every connection attempt.

## Backend and data

- FastAPI workers are stateless.
- PostgreSQL is the production source of truth.
- Session ownership is checked on every sessions, transcripts, notes and AI-question endpoint.
- Database connection pooling is configured with `DB_POOL_SIZE` and `DB_MAX_OVERFLOW`.
- Transcript writes use `(session_id, client_segment_id)` as an idempotency key.
- AI answers use the persisted transcript, not only the generated summary.

This layout scales horizontally: add backend replicas behind a load balancer and use managed PostgreSQL. The live audio load remains between each browser and Deepgram.

## Operational limits

A browser application cannot guarantee recording after the tab is closed, the computer sleeps, or the operating system revokes screen/audio capture. The UI warns before closing an active recording, resumes suspended audio when the tab becomes visible, and preserves finalized text locally during API outages. For strict call-center-grade guarantees, the next architecture step is server-side meeting ingestion or a native desktop capture agent.

## Production checklist

- HTTPS domain and `COOKIE_SECURE=true`
- Unique PostgreSQL password and restricted network access
- Deepgram and AI-provider usage limits/alerts
- Automated encrypted PostgreSQL backups with restore tests
- Central logs, uptime checks and error monitoring
- Load test using the expected number of concurrent managers
