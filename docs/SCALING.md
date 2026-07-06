# Helio — Scaling

How the current single-replica architecture grows, in the order the bottlenecks would actually appear. Each step was designed for in advance — none requires rearchitecting.

## 1. Horizontal API scaling (the first real step)

Today: one API replica; Socket.IO rooms and the connection registry are in-process, which is why the compose stack runs a single `api` container.

To run N replicas:

1. **Socket.IO Redis adapter** — install `@socket.io/redis-adapter`, register a custom `IoAdapter` in `main.ts` over the existing Redis connection. Room broadcasts then fan out across instances; **nothing in the gateway changes** (it already holds no business state — the comment in `realtime.gateway.ts` marks the exact seam).
2. **Sticky sessions** at the load balancer (Socket.IO handshake affinity) — or WebSocket-only transport, which is what the widget already uses.
3. **Connection registry → Redis keys** — presence is currently instance-local groundwork; `ConnectionRegistryService` becomes a write-through to Redis (`presence:<userId>` sets). Its consumers (metrics, admin) already go through the service interface.
4. Everything else is already stateless: JWT auth (no server session), AsyncLocalStorage per request, uploads streamed to S3, no in-memory caches that matter.

The migration-gated entrypoint is replica-safe: TypeORM migration runs take an advisory lock, and "no pending migrations" is a fast no-op — but running migrations as a separate deploy step (job/init container) is cleaner at N replicas.

## 2. Redis

Single Redis today serves rate limiting + health. With scale it also carries the socket adapter pub/sub and presence. All access goes through one `RedisService`; pointing `REDIS_URL` at a managed cluster (ElastiCache/Upstash) is a config change. Rate-limit windows use atomic INCR/EXPIRE and are correct under concurrency. The AI guard deliberately **fails open** on Redis errors — under scale, revisit per endpoint whether open or closed is the right failure mode.

## 3. Queues (background work)

The automation engine runs in-process on an event bus: fine at current volume, no retries. The designed next step is **BullMQ** on the existing Redis:

- automation executions → jobs (retry/backoff, per-workspace concurrency caps, dead-letter on repeated failure — `automation_executions` already records FAILED)
- outbound email sends → jobs (absorb Resend rate limits/outages; today a failure surfaces to the agent immediately)
- AI summary generation for `aiSummary` automation actions → jobs

`ConversationEventsModule` is the single choke point where `emit()` becomes `queue.add()` — business modules don't change.

## 4. Caching

Deliberately minimal caching today (correctness first): the AI summary cache (freshness by `lastMessageAt` timestamp comparison — no invalidation logic to break) and denormalized inbox fields. Next candidates, all Redis with short TTLs: workspace membership lookups (hot on every request; invalidate on member mutations), public help-center payloads per workspace (invalidate on article publish), and contact profiles. The dashboard already caches client-side via React Query.

## 5. Database

Current posture: every tenant query is indexed on `workspace_id` (+ the migrations add targeted composite indexes: conversations by workspace/status, messages keyset, audit by workspace/time, GIN for KB search). Keyset pagination keeps message reads O(page) regardless of history length.

Growth path, in order:

1. **Managed Postgres with read replicas** — route heavy read surfaces (audit trail, contact lists, KB search) to replicas via TypeORM's replication config; writes stay primary.
2. **Partitioning** `messages` and `audit_logs` by month (both are append-only and time-queried) once they reach hundreds of millions of rows.
3. **Archival** — RESOLVED conversations past a retention window move to cold storage; audit logs to a log store.
4. Tenant sharding by `workspace_id` is the far-future option; the strict per-workspace data model makes it feasible (no cross-tenant queries exist).

## 6. File uploads

Already scale-ready: uploads stream (multipart → disk temp → provider, never whole-file buffers), S3 is the store, and **downloads are presigned URLs** — bytes never transit the API, so file traffic doesn't consume API capacity. Next steps if needed: direct-to-S3 browser uploads with presigned POST (removes upload bytes from the API too), CloudFront in front of S3, per-workspace storage quotas (sizes already recorded per attachment), and a lifecycle rule for the `.health/probe` sentinel keys.

## 7. Email

Inbound already scales elastically: Cloudflare Email Routing + Worker absorb bursts at the edge; the webhook is a fast insert (perf-smoke tested at 20 concurrent). Thread matching is indexed on `message_id_header`. Outbound moves to the queue (step 3) for retry/backoff under provider throttling; multiple workspace mailboxes/domains are already modeled by `email_accounts`.

## 8. Web/dashboard & widget

Next.js standalone containers are stateless — replicate freely behind the LB or move to a CDN-fronted platform. The widget bundles are static files; serving them from a CDN (the standalone `packages/chat-widget/Dockerfile` nginx image exists for a dedicated widget origin) removes them from app traffic entirely.

## Summary table

| Bottleneck                 | First signal                     | Fix                             | Effort               |
| -------------------------- | -------------------------------- | ------------------------------- | -------------------- |
| Realtime fan-out           | >1 API replica needed            | Redis adapter + sticky sessions | Small, seam prepared |
| Automation reliability     | Missed/failed actions under load | BullMQ jobs                     | Small–medium         |
| Hot reads                  | p95 latency on inbox/membership  | Redis caches + read replicas    | Medium               |
| Message/audit table growth | Slow queries at ~10⁸ rows        | Partitioning + archival         | Medium               |
| Upload bandwidth           | API CPU/network saturation       | Direct-to-S3 presigned uploads  | Small                |
| Email spikes               | Resend throttling                | Queued outbound                 | Small                |
