# Helio — Deployment Guide

Run the entire Helio platform (API, dashboard, chat widget, PostgreSQL, Redis) with one command:

```bash
cp .env.production.example .env   # fill in JWT_SECRET at minimum
docker compose up --build
```

- Dashboard: <http://localhost:3000>
- API: <http://localhost:4000> (health: <http://localhost:4000/health>)
- Widget demo: <http://localhost:3000/demo>

---

## 1. Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Docker Engine | 24+ | <https://docs.docker.com/engine/install/> |
| Docker Compose | v2 (the `docker compose` plugin) | Bundled with Docker Desktop |
| Free ports | 3000, 4000 | Override with `WEB_PORT` / `API_PORT` in `.env` |

No Node.js, pnpm, PostgreSQL, or Redis installation is needed on the host — everything runs in containers. Docker Compose creates the private network and named volumes automatically.

**Docker installation quick reference**

- macOS / Windows: install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
- Linux: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker $USER` and re-login.
- Verify: `docker --version && docker compose version`.

## 2. Environment setup

```bash
cp .env.production.example .env
```

Then edit `.env`. Every variable is documented inline in the file; summary:

### Required

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Token signing secret, **min 32 chars**. Generate: `openssl rand -base64 48`. Compose refuses to start without it. |

### Infrastructure (bundled containers — defaults work out of the box)

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `helio` / `helio` / `helio` | Credentials for the bundled PostgreSQL. Change the password for any long-lived deployment. `DATABASE_URL` and `REDIS_URL` are composed automatically from the service names — you never set them for compose. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | `30` | Refresh-token lifetime |

### Optional providers (empty = feature disabled, app still runs)

| Variable | Feature when set |
| --- | --- |
| `GEMINI_API_KEY` | AI reply suggestions / conversation summaries (Google Gemini) |
| `RESEND_API_KEY` | Outbound email (Resend) |
| `STORAGE_PROVIDER` | `local` (default — files persist in the `api_storage` volume) or `s3` |
| `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 uploads when `STORAGE_PROVIDER=s3`. If incomplete, uploads alone are unavailable and `/health` reports `degraded` — nothing else breaks. |

A missing optional key produces a startup **warning** and disables that feature only. The API never refuses to boot over an optional provider.

### URLs, CORS, ports

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | **Build-time** — the API URL the user's *browser* calls (not the internal Docker hostname). Changing it requires `docker compose build web`. |
| `NEXT_PUBLIC_DEMO_WORKSPACE_ID` | empty | Workspace id for the `/demo` widget page and `/help` center (build-time). |
| `DASHBOARD_URL` | `http://localhost:3000` | Informational (startup logs). |
| `CORS_ORIGINS` | empty | Comma-separated browser-origin allowlist. Empty reflects any origin — required when the chat widget is embedded on arbitrary customer sites, and safe here because auth is Bearer-token, not cookies. If you set it, include the dashboard origin **and** every widget-embedding site. |
| `API_PORT` / `WEB_PORT` | `4000` / `3000` | Host ports to publish. |

Secrets live only in `.env`, which is gitignored — never commit it.

## 3. First startup

```bash
docker compose up --build
```

What happens, in order:

1. **postgres** and **redis** start; compose waits for their health checks (`pg_isready`, `redis-cli ping`).
2. **api** starts only after both are healthy. Its entrypoint runs **TypeORM migrations against the compiled datasource** and aborts (non-zero exit → restart policy retries) if any migration fails — NestJS boots only after migrations succeed.
3. The API validates configuration (fails fast if `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET` are missing/invalid; warns and disables features for missing optional providers), then logs a structured startup summary: version, environment, URLs, DB + migration version, Redis, Socket.IO, provider status, storage mode.
4. **web** (dashboard, which also serves the widget bundles at `/widget.js`) starts once the API health check passes.

First build takes a few minutes (dependency download); rebuilds are fast thanks to layer caching. Run detached with `docker compose up --build -d`.

### Verify it's up

```bash
curl http://localhost:4000/health
```

Expected shape:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "production",
  "uptimeSeconds": 42,
  "checks": {
    "database": { "status": "up" },
    "redis": { "status": "up" },
    "socket": { "status": "up", "connectedSockets": 0 },
    "ai": { "provider": "gemini", "status": "up" },
    "email": { "provider": "resend", "status": "up" },
    "storage": { "provider": "LOCAL", "status": "up" }
  },
  "system": {
    "memory": { "rssMb": 190.7, "heapUsedMb": 57.1, "heapTotalMb": 90.9 },
    "cpu": { "loadAverage": [1.1, 1.4, 1.6], "cores": 8 }
  }
}
```

Status semantics:

- `ok` — everything up (HTTP 200)
- `degraded` — API serves traffic but an optional capability is unavailable (S3 unreachable, AI/email key missing). HTTP 200 so load balancers keep routing.
- `down` — database or Redis unreachable. HTTP 503.

## 4. Day-2 operations

| Task | Command |
| --- | --- |
| Stop (keep data) | `docker compose down` |
| Stop and **delete all data** | `docker compose down -v` |
| Logs, all services | `docker compose logs -f` |
| Logs, one service | `docker compose logs -f api` |
| Restart one service | `docker compose restart api` |
| Service status + health | `docker compose ps` |
| Shell inside the API container | `docker compose exec api sh` |
| Re-run migrations manually | `docker compose exec api node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run` |

### Updating a deployment

```bash
git pull
docker compose build        # or: docker compose build api / web
docker compose up -d
```

Migrations run automatically on API start. Containers stop via SIGTERM and the API shuts down gracefully (drains HTTP + Socket.IO, closes Redis and the database pool, flushes logs) within Docker's 10s grace period.

Data persistence across updates: PostgreSQL data (`postgres_data`), Redis AOF (`redis_data`), and local uploads (`api_storage`) live in named volumes and survive `down`/`up` — only `down -v` deletes them.

## 5. Architecture overview

```
                         ┌────────────────────────────────────────────┐
 browser ── :3000 ──────▶│ web (Next.js standalone, non-root node)    │
   │                     │ dashboard + /widget.js + /widget-app.js    │
   │                     └────────────────────────────────────────────┘
   │                              │ (build-time NEXT_PUBLIC_API_URL)
   └──── :4000 ─────────▶┌────────────────────────────────────────────┐
      REST + Socket.IO   │ api (NestJS, non-root node)                │
                         │ entrypoint: migrations → boot              │
                         └──────┬────────────────────────┬────────────┘
                                │ helio network          │
                     ┌──────────▼─────────┐   ┌──────────▼─────────┐
                     │ postgres:16-alpine │   │ redis:7-alpine     │
                     │ postgres_data vol  │   │ redis_data vol     │
                     └────────────────────┘   └────────────────────┘
   external (optional): Gemini API · Resend API · AWS S3 · Cloudflare Email Worker
```

- Only `web` and `api` publish host ports; PostgreSQL and Redis are reachable solely on the internal `helio` bridge network (auto-created).
- Socket.IO shares the API's HTTP port — no extra port or service.
- The chat widget is served by the dashboard (`/widget.js`); a standalone static image exists at `packages/chat-widget/Dockerfile` (nginx-unprivileged, port 8080) for CDN-style hosting on a dedicated origin — not needed for the default deployment.
- `packages/email-worker` is a Cloudflare Email Worker deployed separately with `wrangler deploy`; point its `WEBHOOK_URL` at the public API origin for inbound email.

**Images** (multi-stage, pnpm store cache mounts, non-root users, `NODE_ENV=production`):

| Image | Base (runtime) | Contents |
| --- | --- | --- |
| `helio-api` | `node:22-slim` | `dist/` + production deps only (`pnpm deploy --prod`); glibc base because bcrypt ships prebuilt glibc binaries |
| `helio-web` | `node:22-alpine` | Next.js standalone output + static assets + widget bundles |
| chat-widget (optional) | `nginxinc/nginx-unprivileged:alpine` | the two static widget bundles |

## 6. Common errors & troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `JWT_SECRET is required` when running compose | You didn't create `.env` or left `JWT_SECRET` empty. `cp .env.production.example .env` and set it (min 32 chars). |
| `"JWT_SECRET" length must be at least 32 characters long` in api logs | Secret too short — regenerate with `openssl rand -base64 48`. |
| `port is already allocated` | Something on the host uses 3000/4000. Set `WEB_PORT` / `API_PORT` in `.env`. |
| api restarts in a loop with migration errors | Migration failed (by design the API won't boot). Check `docker compose logs api`. If the schema is from an incompatible experiment, reset with `docker compose down -v` (deletes data) and start clean. |
| Dashboard loads but API calls fail in the browser | `NEXT_PUBLIC_API_URL` doesn't match how the browser reaches the API (it is baked in at build time). Fix it in `.env`, then `docker compose build web && docker compose up -d web`. |
| `/health` shows `"storage": {"status": "degraded"}` | S3 selected but unreachable/misconfigured (the probe does a sentinel `PutObject`, the exact permission uploads need). Uploads are unavailable; everything else works. Check the AWS_* values or switch to `STORAGE_PROVIDER=local`. |
| AI/email "disabled" warnings at startup | Expected when `GEMINI_API_KEY`/`RESEND_API_KEY` are empty — set the key and `docker compose up -d api` to enable. |
| `postgres` unhealthy on first run | Usually a dirty `postgres_data` volume from an earlier run with different credentials. `docker compose down -v` and retry. |
| Slow first build / re-downloading deps | Ensure BuildKit is on (default in Docker 23+). The pnpm store is cached in a build-cache mount; only lockfile changes invalidate it. |
| Widget doesn't load on `/demo` | `NEXT_PUBLIC_DEMO_WORKSPACE_ID` was empty at build time. Create a workspace in the dashboard, put its id in `.env`, rebuild `web`. |

## 7. Production notes

- **Reverse proxy / TLS**: put nginx/Caddy/Traefik (or a cloud LB) in front of ports 3000/4000 and terminate TLS there. The API sets `trust proxy`, so client IPs from `X-Forwarded-For` are honored for logging/audit/rate limiting. Remember Socket.IO needs WebSocket upgrade headers proxied on the API origin.
- **CORS**: set `CORS_ORIGINS` to lock the API down once you know every origin (dashboard + all widget-embedding sites); leave empty for open-embed widgets (Bearer auth keeps this safe).
- **Secrets**: rotate `JWT_SECRET` and the PostgreSQL password for real deployments; use your orchestrator's secret store rather than `.env` files where possible.
- **Scaling**: a single API replica is assumed — Socket.IO rooms are in-process. To run more replicas, add `@socket.io/redis-adapter` over the existing Redis connection (see the note in `realtime.gateway.ts`) and enable sticky sessions.
- **Backups**: `docker compose exec postgres pg_dump -U helio helio > backup.sql`. Volumes are the source of truth for DB, Redis AOF, and local uploads.
- **Debug logging** is development-only (pino level `info` + JSON output in production; Swagger UI at `/docs` is disabled in production).
- **Monitoring**: Prometheus metrics at `GET /metrics` on the API; scrape it from the internal network or protect it at the proxy.
