# ZoomScribe Docker Deployment

## Local Docker Check

1. Create env file:

```bash
cp .env.example .env
```

2. Fill `.env` with real API keys.

3. Build and run:

```bash
docker compose up -d --build
```

4. Open:

```text
http://localhost:8080
```

The backend is available through the frontend proxy at `/api/*`. SQLite data is stored in the Docker volume `zoomscribe_backend_data`.

## Server Transfer

1. Install Docker and Docker Compose plugin on the server.

2. Copy the project to the server:

```bash
rsync -av --exclude node_modules --exclude frontend/dist --exclude backend/data . user@SERVER_IP:/opt/zoomscribe/
```

3. SSH into the server:

```bash
ssh user@SERVER_IP
cd /opt/zoomscribe
```

4. Create production env:

```bash
cp .env.example .env
nano .env
```

Set at least `GROQ_API_KEY` or `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, a unique `POSTGRES_PASSWORD`, and the Google OAuth variables if you want Google login.

5. Start:

```bash
docker compose up -d --build
```

6. Check status:

```bash
docker compose ps
docker compose logs -f
```

## Domain And HTTPS

For microphone and screen/system-audio capture, browsers require HTTPS except on localhost. Put a reverse proxy such as Caddy, Nginx Proxy Manager, Traefik, or server Nginx in front of this compose stack.

If Caddy runs as a Docker container on the same server, connect it to the ZoomScribe network:

```bash
docker network connect zoomscribe_network caddy
```

Then add this block to the existing Caddyfile:

```caddyfile
zoomscribe.duckdns.org {
    reverse_proxy zoomscribe_frontend:80
}
```

After adding a domain, update `.env`:

```bash
CORS_ORIGINS=https://your-domain.com
COOKIE_SECURE=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
FRONTEND_URL=https://your-domain.com
```

Then rebuild/restart:

```bash
docker compose up -d --build
```

## Scaling: Worker And Connection-Pool Sizing

Each backend container opens up to `WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` connections to Postgres (one pool per `uvicorn --workers` process). With the defaults (`WEB_CONCURRENCY=2`, `DB_POOL_SIZE=10`, `DB_MAX_OVERFLOW=20`), a single backend container can open up to **60** connections.

Postgres' own default is `max_connections=100`. If you scale out by adding more backend replicas behind a load balancer (see `ARCHITECTURE.md`), keep this under control:

```
replicas × WEB_CONCURRENCY × (DB_POOL_SIZE + DB_MAX_OVERFLOW) ≲ 0.8 × postgres max_connections
```

With the defaults above, that's already most of a stock `max_connections=100` Postgres from **one** replica — a second replica will exceed it. Before adding replicas, either:

- lower `DB_POOL_SIZE`/`DB_MAX_OVERFLOW` per replica (e.g. `DB_POOL_SIZE=5`, `DB_MAX_OVERFLOW=5` comfortably supports several replicas under the default limit), or
- raise Postgres' `max_connections` (`docker compose exec postgres psql -U zoomscribe -c "ALTER SYSTEM SET max_connections = 300;"`, then restart the `postgres` service), or
- put PgBouncer in front of Postgres and point `DATABASE_URL` at it, so replica × worker pools multiplex onto a small number of real server connections.

## PostgreSQL Backups

Create a logical backup:

```bash
docker compose exec -T postgres pg_dump -U zoomscribe -d zoomscribe > zoomscribe.sql
```

Restore into an empty database:

```bash
docker compose exec -T postgres psql -U zoomscribe -d zoomscribe < zoomscribe.sql
```

For production, schedule encrypted off-server backups and test restoration regularly.
