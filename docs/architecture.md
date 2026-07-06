# Helio — Architecture

Deep-dive companion to the [README](../README.md). Related: [realtime.md](realtime.md), [SCALING.md](SCALING.md), [testing.md](testing.md), [ci-cd.md](ci-cd.md), [production-runbook.md](production-runbook.md).

## 1. Services

| Service          | Runtime                                   | Responsibility                                                                                                                                                  |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **api**          | NestJS 11 (Node 22)                       | REST API + Socket.IO gateway on one HTTP server; all business logic; TypeORM ↔ PostgreSQL; ioredis ↔ Redis; provider adapters for Gemini / Resend / S3-or-local |
| **web**          | Next.js 15 standalone                     | Agent dashboard (app router), serves the widget bundles (`/widget.js`, `/widget-app.js`) and the `/demo` sample site + `/help` public help center               |
| **chat-widget**  | Preact, built by Vite as two IIFE bundles | `widget.js` — ~2 KB vanilla loader; `widget-app.js` — the lazily-loaded chat app, mounted into a Shadow DOM                                                     |
| **email-worker** | Cloudflare Worker                         | Adapter between Cloudflare Email Routing and `POST /email/webhook`; parses MIME (postal-mime), forwards JSON; zero business logic                               |
| **postgres**     | PostgreSQL 16                             | System of record; migrations only (`synchronize` off permanently)                                                                                               |
| **redis**        | Redis 7                                   | AI rate-limit windows, health checks (adapter-ready for Socket.IO scaling)                                                                                      |

The API is a **modular monolith**: one deployable, strict module boundaries (`modules/auth`, `modules/conversations`, `modules/ai`, …, plus cross-cutting `realtime/`, `metrics/`, `common/`). Modules communicate through injected services; the realtime emitter and event bus are dependency-free bridge modules that prevent import cycles.

## 2. Request flow (REST)

```
request
  → Express middleware: helmet, compression, request-id + AsyncLocalStorage seeding
  → pino HTTP logging (request-id correlated, auth headers redacted)
  → Nest guards: JwtAuthGuard → RolesGuard (resolves workspace membership
        from x-workspace-id header + JWT user; rejects non-members 403)
  → ValidationPipe (whitelist, forbidNonWhitelisted, transform) on the DTO
  → controller → service (business rules, tenancy filters) → TypeORM repos
  → interceptors record HTTP metrics; AllExceptionsFilter shapes errors
  ← JSON response (x-request-id echoed)
```

Request context (request id, IP, user agent, then user/workspace once guards resolve them) lives in **AsyncLocalStorage** — audit writes and logs read it ambiently, so services never thread correlation parameters through signatures.

**Tenancy invariant**: the workspace id used in queries always comes from the caller's _verified membership_, never from request input. Foreign resources 404 (existence hidden); foreign workspace headers 403.

## 3. WebSocket flow

```
socket connect (auth: {token} agent | {visitorToken} visitor)
  → gateway middleware verifies principal BEFORE admission (reject = connect_error)
  → joinWorkspace {workspaceId}    → membership re-checked in DB → workspace:<id> room
  → joinConversation {conversationId} → tenancy/ownership check → conversation:<id> room
  → sendMessage {conversationId, content, attachmentIds?}
       → throttle (10/10 s per socket) → authorize → MessagesService (same code path as REST)
       → broadcast messageCreated to conversation ∪ workspace rooms
       → ack {message} (persisted DTO) — or {error} for deterministic rollback
  → typingStart/Stop relayed to the conversation room (15/5 s throttle)
disconnect → connection registry updated (metrics gauge)
```

Messages created over REST (widget fallback, agent endpoint, inbound email) broadcast through `RealtimeEmitterService` — a standalone module holding the Socket.IO server reference — so business modules never import the gateway (which would create a module cycle). Full event catalog: [realtime.md](realtime.md).

## 4. AI flow

```
POST /ai/conversations/:id/summary (or reply/classify/kb; /ai/rewrite)
  → JwtAuthGuard + RolesGuard + AiRateLimitGuard (Redis window 30/5 min, fails open)
  → AiService: tenancy check → load transcript → prompt builder
  → AI_PROVIDER (Gemini over fetch, 25 s abort)
       errors → AiProviderError(unavailable|timeout|quota|malformed) → mapped HTTP status
  → summary: upsert conversation_summaries; freshness = lastMessageAt ≤ summary.updatedAt
       (fresh cache hit skips the provider call entirely)
  → classification/KB: JSON-mode response, shape-validated before returning
```

## 5. Email flow

```
INBOUND   Gmail → Cloudflare Email Routing → email-worker (MIME parse)
          → POST /email/webhook {from, to, subject, messageId, inReplyTo, references, text, html, attachments[]}
          → mailbox lookup (email_accounts) → workspace   [unknown mailbox → 404, nothing created]
          → thread match: In-Reply-To/References vs email_threads rows
                hit + conversation not RESOLVED → append to that conversation
                miss or RESOLVED → new EMAIL conversation (find-or-create contact by sender)
          → message persisted, Message-ID recorded, sockets broadcast, automation event emitted

OUTBOUND  POST /email/conversations/:id/send {content}
          → validates EMAIL channel + not RESOLVED + contact has address
          → persists agent message → Resend API (From: workspace mailbox,
            In-Reply-To/References from stored thread ids) → broadcast
```

## 6. Widget flow

```
<script src="https://…/widget.js"> + window.Helio.init({workspaceId, apiUrl})
  → loader validates config, injects launcher into #helio-widget's open Shadow DOM
  → first click: injects widget-app.js (lazy) → __HELIO_MOUNT__(config, shadowRoot)
  → app: visitorId from localStorage (per-workspace key; UUID fallback; in-memory
    fallback when storage is blocked)
  → POST /widget/session {workspaceId, visitorId}  — idempotent find-or-create:
    contact (by workspace+visitorId) + active chat conversation + visitor JWT
  → socket connect {visitorToken} → joinConversation → live chat
       optimistic send → ack reconciliation; REST fallback when disconnected;
       reconnect → refetch history, dedupe by id
  → attachments: multipart upload with progress via XHR; downloads through
    token-authorized endpoint
  → resolved conversation → sends are rejected → app starts a fresh session
    automatically and redelivers the text
```

Isolation: everything renders inside the Shadow DOM (host CSS cannot leak in), assets are same-origin with the dashboard, and the visitor token scopes strictly to one workspace + contact + conversation.

## 7. Database

PostgreSQL via TypeORM; migrations are the only schema path (the API entrypoint runs them before boot and aborts on failure). Entity map and relationships: see [README → Database Design](../README.md#database-design).

Patterns worth noting:

- **Keyset pagination** for messages (cursor = created_at + id), offset pagination for admin-ish lists.
- **Denormalized inbox fields** on conversations (`last_message_preview`, `last_message_at`) maintained transactionally with message writes.
- **Generated tsvector column** with weighted fields + GIN index for KB search — search stays correct under concurrent writes with no application-side indexing.
- **Transactions** wrap multi-row invariants: signup (user+workspace+membership+session), message+attachment linking, assignment+history.
- Enums are real Postgres types; uuid PKs via `uuid-ossp`.

## 8. Deployment

Compose stack (`docker-compose.yml`): postgres → redis → api (migration-gated entrypoint) → web, health-gated in that order, named volumes, internal network, non-root images.

Production (dineshbhadane.com): identical stack fronted by a **Cloudflare named tunnel** — outbound-only origin (no inbound ports), edge Universal SSL, three hostnames (dashboard / demo-with-Caddy-rewrite / api), inbound email via the Cloudflare worker. CI verifies every push (400 tests + Docker boot + E2E); deploys are explicit `docker compose up -d --build`. Full operational detail: [production-runbook.md](production-runbook.md); generic instructions: [../DEPLOYMENT.md](../DEPLOYMENT.md).

Degradation model: DB/Redis down → `/health` 503 (`down`); S3/Gemini/Resend missing or failing → feature-level degradation, `/health` reports `degraded` with per-component status while everything else serves.
