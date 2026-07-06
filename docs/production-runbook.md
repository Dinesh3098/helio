# Production Runbook — dineshbhadane.com deployment

What is deployed, how it was deployed, every command that matters, and how
changes get to production. This documents the **live deployment**; the
generic guide for deploying anywhere is [DEPLOYMENT.md](../DEPLOYMENT.md),
and CI is documented in [ci-cd.md](./ci-cd.md).

## 1. What is live

| URL                             | Serves                                 | Origin                |
| ------------------------------- | -------------------------------------- | --------------------- |
| https://helio.dineshbhadane.com | Dashboard (Next.js)                    | `web` container :3000 |
| https://demo.dineshbhadane.com  | Widget demo (`/` rewritten to `/demo`) | Caddy :8081 → `web`   |
| https://api.dineshbhadane.com   | API + Socket.IO                        | `api` container :4000 |

**Architecture** — the origin is the Mac running Docker; Cloudflare fronts it:

```
Internet ──HTTPS/WSS──▶ Cloudflare edge (DNS + Universal SSL + WebSocket proxy)
                             │  named tunnel "helio" (outbound-only — no open inbound ports)
        helio.dineshbhadane.com ─┼─▶ localhost:3000  web    (Next.js standalone)
        api.dineshbhadane.com ───┼─▶ localhost:4000  api    (NestJS + Socket.IO)
        demo.dineshbhadane.com ──┴─▶ localhost:8081  caddy ─▶ web (/ → /demo rewrite)
                                     postgres:16 ─┐ internal-only (no host ports)
                                     redis:7 ─────┘ named volumes
external: AWS S3 (uploads) · Gemini (AI) · Resend (outbound email)
inbound email: Gmail → Cloudflare Email Routing → helio-email-worker → https://api.dineshbhadane.com/email/webhook
```

**Environment split** — what production shares with dev and what it doesn't:

| Component                | Dev           | Production                                               |
| ------------------------ | ------------- | -------------------------------------------------------- |
| PostgreSQL               | Neon (cloud)  | `postgres` container, named volume — **separate data**   |
| Redis                    | Upstash       | `redis` container — separate                             |
| JWT secret / DB password | dev values    | freshly generated at deploy — separate                   |
| Gemini / Resend / S3     | real accounts | **same real accounts** (S3 bucket is shared)             |
| Inbound email worker     | —             | points at production only (one webhook target at a time) |

## 2. How it was deployed (chronological)

Tools used: **Docker + Docker Compose** (the stack), **cloudflared** (tunnel + DNS), **wrangler** (email worker), **Caddy** (demo host rewrite), **launchd** (tunnel autostart), curl/psql for verification.

1. **Production env file** — generated `.env.production.local` (gitignored, chmod 600): fresh `JWT_SECRET` (64 random bytes) and fresh `POSTGRES_PASSWORD`; real `GEMINI_API_KEY`, `RESEND_API_KEY`, `AWS_*` copied from dev; `STORAGE_PROVIDER=s3`; `NEXT_PUBLIC_API_URL=https://api.dineshbhadane.com`; `API_PORT=4000`, `WEB_PORT=3000`. A pre-flight gate hard-fails if any required variable is missing.
2. **Gates** — `pnpm install --frozen-lockfile && pnpm lint && pnpm check-types && pnpm build`.
3. **Stack up** — `docker compose --env-file .env.production.local -p helio-prod up -d --build --wait`. The api entrypoint ran all TypeORM migrations against the empty database before booting (`synchronize` is permanently off).
4. **Tunnel auth (the one manual step)** — `cloudflared tunnel login` (browser; picks the zone). Drops `~/.cloudflared/cert.pem`, which authorizes tunnel + DNS management.
5. **Tunnel + DNS** — `cloudflared tunnel create helio`, then `cloudflared tunnel route dns helio <host>` for all three hostnames (creates the CNAMEs automatically). Ingress mapping lives in `~/.cloudflared/config.yml`. SSL is Cloudflare Universal SSL at the edge — nothing to issue or renew.
6. **Demo host** — Caddy container (`helio-demo-caddy`, config in `deploy/Caddyfile`) rewrites `/` → `/demo` for `demo.dineshbhadane.com` and passes everything else (widget bundles, assets) through to the dashboard.
7. **Tunnel as a service** — user LaunchAgent `~/Library/LaunchAgents/com.helio.tunnel.plist` (`RunAtLoad` + `KeepAlive`): starts on login, restarts if it dies. Log: `/tmp/helio-tunnel-agent.log`.
8. **Email worker** — `wrangler.toml` `WEBHOOK_URL` set to `https://api.dineshbhadane.com` and `wrangler deploy`. This replaced the fragile dev quick-tunnel permanently.
9. **Verification** — 23-step end-to-end walkthrough over the public URLs: auth (signup/login/refresh/logout), RBAC, widget, **WSS Socket.IO through the Cloudflare edge**, typing, REST fallback, real Gemini (summary/cache/reply/rewrite/classify/KB-suggest), real S3 (upload → presigned download), real Resend send, inbound webhook + threading, automation, audit, timeline, workspace isolation, health/metrics/request-ids/Helmet/Swagger-disabled.

## 3. Commands you need

**Site down for any reason? One command brings everything back:**

```bash
./deploy/prod-up.sh
```

Idempotent — it starts Docker if quit, brings up the stack (health-gated),
restarts the demo Caddy, kicks the tunnel, re-arms the sleep blocker, and
probes all three public URLs. Covers Docker-quit, laptop-sleep, and reboot.

All other commands run from the repo root. The env file `--env-file .env.production.local` and project `-p helio-prod` matter — without them compose targets the wrong stack.

```bash
# Status / logs
docker compose --env-file .env.production.local -p helio-prod ps
docker compose --env-file .env.production.local -p helio-prod logs -f api

# DEPLOY A CODE CHANGE (see §4): rebuild changed service(s) and swap
docker compose --env-file .env.production.local -p helio-prod up -d --build api
docker compose --env-file .env.production.local -p helio-prod up -d --build web   # also needed when NEXT_PUBLIC_* changes

# Restart / stop / start (data survives; `down -v` would DELETE data)
docker compose --env-file .env.production.local -p helio-prod restart api
docker compose --env-file .env.production.local -p helio-prod down        # stop stack, keep volumes
docker compose --env-file .env.production.local -p helio-prod up -d       # bring back

# Tunnel
launchctl unload ~/Library/LaunchAgents/com.helio.tunnel.plist   # stop
launchctl load   ~/Library/LaunchAgents/com.helio.tunnel.plist   # start
tail -f /tmp/helio-tunnel-agent.log                              # tunnel logs
cloudflared tunnel info helio                                    # edge connections

# Email worker (after changing packages/email-worker)
cd packages/email-worker && pnpm exec wrangler deploy
pnpm exec wrangler tail helio-email-worker                       # live worker logs

# Database access (Beekeeper etc.) — localhost-only tap on :55432
docker ps | grep helio-prod-db-tap                               # is the tap running
docker rm -f helio-prod-db-tap                                   # close the tap
# reopen:
docker run -d --name helio-prod-db-tap --restart unless-stopped \
  --network helio-prod_helio -p 127.0.0.1:55432:5432 alpine/socat \
  tcp-listen:5432,fork,reuseaddr tcp-connect:postgres:5432

# Backup / restore production data
docker compose --env-file .env.production.local -p helio-prod exec -T postgres \
  pg_dump -U helio helio > backup-$(date +%F).sql

# Health check
curl -s https://api.dineshbhadane.com/health | jq .
```

Secrets live in `.env.production.local` (repo root, gitignored). Losing it loses the DB password and JWT secret — keep a copy somewhere safe.

## 4. Does a commit deploy automatically? **No — and here's the full picture**

```
git push origin develop
      │
      ▼
GitHub Actions CI (automatic):  lint → types → build → 400 tests →
      docker compose build+boot with mock env → E2E probes
      │
      ▼            ✅ CI green means the commit is SAFE to deploy
   nothing else happens — production is untouched
      │
      ▼  (manual, when YOU decide)
docker compose --env-file .env.production.local -p helio-prod up -d --build api web
```

**Why no auto-deploy:** continuous deployment needs an agent on the origin that
GitHub can reach or that polls for releases. This origin is a personal Mac
behind a tunnel — GitHub's runners can't SSH into it, and wiring a self-hosted
runner to auto-touch a personal machine is a bigger security decision than a
release engineer should make unilaterally. So the pipeline is deliberately
**CI-verified, manually deployed**: pushes prove the code is deployable; you
choose when production actually changes. (The `release.yml` workflow can
additionally build & push versioned images to a registry on git tags — useful
the day this moves to a VPS — but it also deploys nothing by itself.)

**So to ship a feature change:**

```bash
git push origin develop            # → wait for CI green (github.com/Dinesh3098/helio/actions)
docker compose --env-file .env.production.local -p helio-prod up -d --build api web
curl -s https://api.dineshbhadane.com/health | jq .status   # confirm "ok"
```

Notes: database migrations run automatically at api startup (the entrypoint
gates boot on them). Rebuild `web` whenever frontend code **or any
`NEXT_PUBLIC_*` variable** changes (those are baked at build time). Rollback =
`git checkout <last-good-sha>` and rerun the same `up -d --build`.

**If you later want real auto-deploy**, the sane options in order of effort:
move the stack to a VPS and let a GitHub Actions job SSH-deploy on push;
or run Watchtower against registry images published by `release.yml`;
or register a self-hosted GitHub runner on the origin machine.

## 5. Known constraints of this deployment

- **The origin is a laptop.** The site is up while the Mac is awake, online, and Docker is running. Sleep = downtime. For durable hosting, the identical compose stack + tunnel config moves to any VPS in one session.
- **Single API replica** — Socket.IO rooms are in-process (adding replicas needs `@socket.io/redis-adapter` + sticky sessions; documented in the gateway).
- **S3 bucket is shared with dev.** No collisions (workspace-scoped UUID keys), but real-world hygiene would be a separate bucket per environment.
- **Inbound email has one target.** The worker posts to production now; dev doesn't receive inbound email unless you repoint `WEBHOOK_URL` (either/or).
- **CORS is open** (`CORS_ORIGINS` empty) — required for the widget to embed on arbitrary sites; safe with Bearer-token auth. Set it if you ever drop the open-embed requirement.
- Production data lives in Docker named volumes on this machine — take periodic `pg_dump` backups (§3).
