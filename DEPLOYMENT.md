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

Set at least `GROQ_API_KEY` or `ANTHROPIC_API_KEY`, and `VITE_DEEPGRAM_API_KEY` if live transcription is required.

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
```

Then rebuild/restart:

```bash
docker compose up -d --build
```

## Backups

SQLite lives in the named Docker volume. To create a backup:

```bash
docker compose exec backend python -c "import shutil; shutil.copyfile('/app/data/scribe.db', '/app/data/scribe.backup.db')"
docker cp "$(docker compose ps -q backend)":/app/data/scribe.backup.db ./scribe.backup.db
```

To inspect the volume location:

```bash
docker volume inspect zoomscribe_backend_data
```
