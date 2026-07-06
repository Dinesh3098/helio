# Helio

Helio is a customer support platform. You drop a small script tag on your website and you get a chat widget; everything customers write there (or email to your support address) lands in one shared inbox where your team replies in real time, with an AI assistant helping draft and summarize along the way.

The live deployment:

- Dashboard: https://helio.dineshbhadane.com
- Widget demo: https://demo.dineshbhadane.com
- API: https://api.dineshbhadane.com ([health](https://api.dineshbhadane.com/health))

To run the whole thing locally you only need Docker: copy `.env.production.example` to `.env`, set a `JWT_SECRET`, and run `docker compose up --build`. There are 400 automated tests behind `pnpm test`.

## How it fits together

```
customer site                        agent browser
     │ <script widget.js>                 │
     │  HTTPS + WSS                       │ HTTPS + WSS
     ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│  web (Next.js) ── dashboard, /demo, /help,          │
│                   serves widget.js                  │
│  api (NestJS) ─── REST + Socket.IO on one port      │
│        │                                            │
│   PostgreSQL          Redis                         │
└────────┼────────────────────────────────────────────┘
         │ providers, each behind an interface:
         ├── Gemini (AI)        ├── AWS S3 (files, local fallback)
         ├── Resend (outbound)  └── Cloudflare Email Routing +
         │                          worker (inbound email webhook)
```

The backend is a single NestJS process — REST and websockets share one HTTP server, and the code is split into modules per domain (auth, conversations, email, ai, and so on). Anything that talks to an outside vendor goes through a provider interface, so Gemini, Resend, and S3 are each one binding to swap, and if an API key is missing that feature just switches off with a warning instead of crashing the app.

## Tech stack

|          |                                                                               |
| -------- | ----------------------------------------------------------------------------- |
| Backend  | NestJS 11, TypeScript, TypeORM, PostgreSQL 16, Redis 7                        |
| Frontend | Next.js 15 (app router), React 19, Tailwind 4, React Query, Zustand           |
| Widget   | Preact, bundled by Vite into two small IIFE files                             |
| Realtime | Socket.IO (agents and visitors on the same gateway)                           |
| Auth     | JWT access tokens + rotating refresh tokens, plain Bearer headers, no cookies |
| Email    | Resend outbound, Cloudflare Email Routing + a tiny Worker inbound             |
| AI       | Google Gemini, called over plain fetch (no SDK)                               |
| Storage  | S3 with presigned downloads; falls back to local disk                         |
| Tooling  | Turborepo + pnpm, GitHub Actions, Docker multi-stage builds                   |

## Repository layout

```
apps/api               NestJS backend; integration tests live in apps/api/test
apps/web               Next.js dashboard (also serves the widget bundles)
packages/chat-widget   the embeddable widget (loader + Preact app)
packages/email-worker  Cloudflare Worker that forwards inbound email to the API
packages/config        shared eslint/tsconfig
e2e/                   Playwright scenarios against the dockerized stack
deploy/                Caddyfile for the demo host + prod recovery script
docs/                  architecture, api reference, realtime, scaling, testing, runbook
```

## What's in the box

**Authentication.** Signup creates the user, their first workspace, and a session in one transaction. Access tokens live 15 minutes; refresh tokens rotate on every use and only their SHA-256 hash is stored, so a leaked one dies the first time the real owner refreshes. You can be logged in from several devices at once.

**Workspaces and roles.** Everything belongs to a workspace. Users can be members of many, with a role per membership (owner, admin, agent), and switch between them — the active workspace travels as an `x-workspace-id` header that a guard checks against actual membership on every request. Agents are deliberately limited: they can only assign conversations to themselves, and can't invite people or change roles.

**The inbox.** Conversations from both channels (chat and email) in one list, with status (open / snoozed / resolved), priority, assignment with history, tags, filters, and search. Message lists use keyset pagination so they stay fast no matter how long a thread gets.

**The chat widget.** Two-stage load: `widget.js` is a ~2 KB loader that draws the launcher bubble and only pulls the actual chat app the first time someone clicks it. It renders inside a Shadow DOM so the host page's CSS can't bleed into it. Visitors get a stable id in localStorage, so returning visitors continue their old conversation. Sends are optimistic with retry, there's an unread badge, typing indicators, file attachments with upload progress, and if the websocket is down it quietly falls back to REST. When an agent resolves a conversation, the widget starts a fresh one on the next message instead of writing into a closed thread.

**Realtime.** One Socket.IO gateway with two kinds of principals — agents authenticate with their JWT, visitors with their widget token — and the check happens in middleware _before_ the connection is accepted. Agents join a workspace-wide room (so the inbox updates for conversations they don't have open) plus per-conversation rooms. Message sends are acknowledged with the persisted message, and errors come back in the ack so the widget can roll its optimistic bubble back cleanly. Messages that arrive over REST (the fallback path, inbound email) are broadcast to the same rooms, so nobody misses anything because of _how_ a message came in.

**Email.** Mail sent to a registered address hits Cloudflare Email Routing, which runs a small Worker that parses the message and POSTs it to the API. The API figures out which workspace owns the mailbox, finds or creates the contact, and threads the message using the standard `Message-ID` / `In-Reply-To` / `References` headers — replies join the existing conversation even when the subject changes. Agent replies go out through Resend with those same headers set, so Gmail threads them properly on the other end. Resolved conversations are terminal: a late reply starts a new conversation rather than reopening a closed one.

**Knowledge base.** Categories and markdown articles with a draft/published flag and slugs. Search is Postgres full-text with weights (title counts more than excerpt, excerpt more than body) over a generated column with a GIN index. Each workspace gets a public help center — no login — that only shows published articles.

**AI assistant.** Five features: conversation summaries, suggested replies, tone rewriting for drafts, classification (category / priority / sentiment / intent), and "which KB articles answer this". Summaries are cached and considered fresh until a newer message arrives — invalidation is just a timestamp comparison, nothing to forget to bust. Everything is rate-limited per user through Redis (30 calls per 5 minutes), and that limiter fails open on purpose: if Redis hiccups you lose the limit, not the AI.

**Automation.** Rules made of a trigger (conversation created, message received, resolved…), typed conditions (channel, message-contains, priority, time of day…), and actions (assign, set priority, tag, auto-reply, run AI). They fire off an in-process event bus and every run is recorded — success or failure with the error.

**Audit log and timeline.** One write path for audit events; actor, workspace, IP, and request id come from request context (AsyncLocalStorage), so the code recording an event only states what happened. Writes are fire-and-forget — an audit failure never breaks the action it describes. The conversation timeline interleaves messages with those events chronologically.

**Attachments.** Uploads stream to S3 (or local disk in dev); the file type allowlist is short and boring on purpose (images, pdf, office docs, txt, csv — no SVG, no HTML, nothing executable). Downloads from S3 are presigned URLs so file bytes never pass through the API. Storage keys are server-generated, so client filenames never touch a path.

**Metrics and health.** Prometheus metrics at `/metrics` (request durations, messages, AI calls, socket gauges) and a `/health` endpoint that reports each component. If S3 or an AI key is broken the report says `degraded` but returns 200 — the load balancer keeps routing because the app can still do its job minus one feature. Only a dead database or Redis makes it report `down` with a 503.

**Custom domains** exist as schema only (an entity with verification/SSL status fields). No provisioning flow was built.

## Database

Eighteen tables. The shape, roughly:

```
users ──< user_sessions                 (refresh token hashes)
users ──< workspace_members >── workspaces        (role lives on the membership)
workspaces ──< contacts ──< conversations ──< messages
workspaces ──< email_accounts           (which mailbox routes to which workspace)
workspaces ──< help_categories ──< help_articles
workspaces ──< automation_rules ──< automation_executions
workspaces ──< audit_logs               (actor nullable = system action)
workspaces ──< attachments              (linked to conversation and message)
conversations ──< conversation_assignments   (assignment history)
conversations ─── conversation_summaries     (1:1 AI summary cache)
conversations ──< email_threads              (Message-IDs for threading)
```

Every tenant-owned table carries `workspace_id` and every query filters on it — there are no query paths that cross workspaces. Conversations denormalize `last_message_preview` and `last_message_at` so the inbox list never joins into messages. Multi-row invariants (signup, message+attachment linking, assignment+history) are wrapped in transactions. Schema changes only happen through migrations; TypeORM's `synchronize` is off for good, and the Docker entrypoint refuses to start the API if a migration fails.

## Deployment

Two layers to this.

**The portable one** — `docker-compose.yml` brings up Postgres, Redis, the API, and the dashboard with health-checked startup order, named volumes, and non-root multi-stage images. The API image runs migrations before it boots. This is what `docker compose up --build` gives you on any machine, and it's what CI boots and probes on every push. Setup details live in [DEPLOYMENT.md](DEPLOYMENT.md).

**The live one** — the same compose stack, fronted by a Cloudflare named tunnel. The tunnel is an outbound-only connection, so the origin has no open inbound ports; Cloudflare terminates SSL (Universal SSL, nothing to renew) and routes the three hostnames — dashboard, demo (through a tiny Caddy that rewrites `/` to `/demo`), and API. Inbound email arrives through the Cloudflare Worker. Operations — every command, backups, recovery, what happens when you push — are written down in [docs/production-runbook.md](docs/production-runbook.md). Short version: pushing to GitHub runs CI (lint, types, all 400 tests, a full Docker boot with probes) but deploys nothing; shipping to production is an explicit `docker compose up -d --build`.

Config is validated at boot. `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` are required — the API refuses to start without them. The provider keys (Gemini, Resend, AWS) are optional; missing ones disable their feature with a startup warning. Every variable is documented in [.env.example](.env.example).

## Security

The one property I treated as non-negotiable is tenant isolation, because in a multi-tenant support tool the worst possible bug is seeing someone else's customers. The workspace id used in queries always comes from the caller's verified membership, never from request input; asking for another workspace's resource gets a 404 (not a 403 — existence isn't revealed); sending a foreign workspace header gets a 403 before any lookup happens. There's a dedicated integration suite that drives every resource type cross-tenant, plus a Playwright test that does it through the UI.

Beyond that: short-lived JWTs with hashed rotating refresh tokens; role guards on every mutating route; a global validation pipe that rejects unknown body fields (same pipe on the websocket gateway); TypeORM parameterized queries everywhere (the only raw SQL in the codebase is in migrations); React/Preact escaping plus markdown rendered without `dangerouslySetInnerHTML` for XSS; Helmet headers in production; and the upload allowlist described above.

CSRF needs a note: it doesn't apply here, by construction. There are no cookies — auth is a Bearer header, which browsers never attach on their own. That's also why CORS can safely stay open, which the widget genuinely needs since it's embedded on arbitrary customer sites. `CORS_ORIGINS` exists if you ever want to lock it down.

## Trade-offs

Things I consciously chose, and what I'd do next:

- **One API replica.** Socket.IO rooms live in process memory, so the stack runs a single API container. This is the right call at this scale — the upgrade is `@socket.io/redis-adapter` over the Redis that's already there, and the gateway was written stateless so that change doesn't touch it. Documented in [docs/SCALING.md](docs/SCALING.md).
- **No job queue.** Automation runs in-process with no retry. Failures are at least recorded. BullMQ is the obvious next step and the event bus is the single place it would slot in.
- **Invites assume the account exists.** Adding a member looks the user up by email; there's no invitation-email-with-signup-link flow.
- **AI calls are synchronous** with a 25-second cap. Fine for a human clicking a button; a queue plus streaming would be the answer at volume.
- **Dashboard unit tests are thin** (~3% — stores, the API client, one form). I spent that budget on API integration tests (90% line coverage, real database) and Playwright flows instead, which I think buys more confidence per hour for this codebase.
- **The widget drops attachments in one edge case:** when a conversation was resolved mid-send and the widget auto-starts a fresh session, it redelivers the text but not the files (their upload belonged to the dead conversation's token).

## Features checklist

Core:

- [x] Auth: signup, login, logout, refresh rotation, multiple sessions
- [x] Multi-workspace, RBAC (owner/admin/agent), workspace switching
- [x] Contacts, auto-created from widget and email, searchable, editable
- [x] Inbox: status, priority, assignment + history, tags, filters, pagination
- [x] Realtime: rooms, typing, acks, broadcast, REST fallback
- [x] Widget: Shadow DOM, session reuse, reconnect, unread badge, retry, uploads, mobile
- [x] Email: inbound webhook, outbound with threading, conversation reuse
- [x] Knowledge base: categories, articles, publish, full-text search, public help center

Stretch:

- [x] AI: summary + cache, suggested reply, rewrite, classification, KB suggestions, rate limit
- [x] Automation: triggers, conditions, actions, execution history
- [x] Audit log + conversation timeline
- [x] Prometheus metrics, structured logs with request ids
- [x] File uploads: S3, presigned downloads, local fallback, graceful degradation
- [ ] Custom domains (schema only)

Infrastructure:

- [x] Docker multi-stage images, one-command compose, migration-gated boot
- [x] CI on every push: lint, types, format, 400 tests, Docker boot + E2E probes, audit
- [x] Tenant-isolation and perf-smoke test suites
- [x] Production deployment on real domains with SSL
- [x] Health endpoint, graceful shutdown, env validation at boot
- [x] Docs: architecture, API reference, realtime, scaling, testing, CI, runbook

## Local development

You need Node ≥ 20, pnpm 9 (`corepack enable`), and Docker.

```bash
git clone git@github.com:Dinesh3098/helio.git && cd helio
pnpm install
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
pnpm --filter @helio/api migration:run
pnpm dev                    # api on :4000, dashboard on :3000
```

The demo page needs the widget bundles once: `pnpm --filter @helio/chat-widget build`. Tests are `pnpm test` — the integration suite starts its own Postgres and Redis containers, see [docs/testing.md](docs/testing.md). If you'd rather not install anything: `cp .env.production.example .env`, set `JWT_SECRET`, `docker compose up --build`.

## Known limitations

- Realtime tops out at one API replica until the Redis adapter is added.
- The live deployment's origin is a workstation behind a tunnel — fine for reviewing, not real hosting. The stack moves to a VPS unchanged.
- No message editing or deletion; read receipts are reserved in the protocol but not implemented.
- Automation has no retry/backoff.
- KB search is configured for English only.
- Custom domains are schema-only.

## License

MIT
