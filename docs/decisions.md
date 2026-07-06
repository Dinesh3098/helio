# Decision Log

> Significant technical decisions and their rationale are recorded here.

## 2026-07-05 — Monorepo scaffold

- **Turborepo + pnpm workspaces** for the monorepo: task caching, parallel builds, and first-class pnpm support.
- **Single `@helio/config` package** for shared ESLint and TypeScript configs instead of separate `eslint-config` / `typescript-config` packages, keeping the workspace list small.
- **Next.js pinned to 15.x** per project requirements (create-turbo defaults to the latest major).
- **No `packages/ui` yet** — an empty component library is an abstraction with no consumers. It will be created when shadcn/ui is introduced.

## 2026-07-05 — Backend foundation

- **Hand-written NestJS app** instead of `nest new` — the generator assumes a standalone repo; writing it in-place keeps monorepo conventions (shared tsconfig/eslint, pnpm workspace).
- **`synchronize: false` permanently** — schema changes will only ever ship as TypeORM migrations, even in development.
- **Single shared ioredis connection** exposed via a global `RedisService`; BullMQ will manage its own connections when introduced.
- **Joi env validation fails fast at boot.** `GEMINI_API_KEY` / `RESEND_API_KEY` are required only in production — no code consumes them yet, and local development must not demand paid credentials.
- **`@nestjs/terminus` for health checks** — standard indicator/timeout handling instead of a hand-rolled controller.
- **nestjs-pino for logging** — structured JSON in production (Datadog/ELK-ready), pretty-printed in development; auth headers redacted.
- **Swagger only in development** (`/docs`) — the public API surface will get separate treatment later.
- **Gemini instead of OpenAI** for the AI provider — supersedes the OpenAI mention in PROJECT_CONTEXT.md (owner decision, 2026-07-05). Config exposes `gemini.apiKey` / `GEMINI_API_KEY`.
- **`autoLoadEntities: false`** — entities will be registered explicitly in DatabaseModule when they exist, per owner preference for an explicit central list.

## 2026-07-05 — Database schema (entities)

- **Entities live in `src/database/entities/`** until feature modules exist; they move with their module when extraction happens.
- **No inverse `@OneToMany` collections** — at millions of rows, `workspace.conversations` as an entity property is an accidental-loading footgun; all reads go through scoped repository queries.
- **Explicit snake_case `name:` on every column** instead of a naming-strategy dependency — zero hidden behavior.
- **Current assignee only on Conversation** (`assigned_to_user_id`, SET NULL) — no assignment-history table, per assignment scope.
- **Denormalized `last_message_preview` / `last_message_at`** on conversations so inbox lists never join the messages table.
- **`messages.sender_id` has no FK** — polymorphic sender (contact or user); nullable for SYSTEM messages. App-layer integrity.
- **Index pruning vs. spec**: dropped single-column indexes that are exact leading prefixes of composite/unique indexes (`contacts.workspace_id`, `conversations.workspace_id`, `messages.conversation_id`, `help_categories.workspace_id`, `help_articles.workspace_id`, `workspace_members.workspace_id`) and the standalone low-cardinality `status`/`channel` indexes — Postgres would not use them and every extra index taxes writes.
- **`strictPropertyInitialization: false` (api only)** — TypeORM hydrates entities at runtime; the check yields only false positives.
- **Tables not yet created in Neon** — migrations are the next database milestone; `synchronize` stays off.

## 2026-07-05 — Authentication (phase 3)

- **Migration infra added with the first real migration** (`user_sessions`): `data-source.ts` + tsx-driven CLI scripts. The 12 pre-existing tables matched entities exactly, so no baseline migration was needed.
- **Refresh tokens: SHA-256, not bcrypt** — 384-bit random tokens need no slow hash, and a deterministic hash allows unique-indexed session lookup. bcrypt (cost 12) is for passwords only.
- **Rotation = overwrite** — refresh replaces the session's hash in place; a replayed old token matches nothing → 401. Logout sets `revoked_at` (kept for audit) and is idempotent.
- **JWT carries `sub` + `email` only, 15 min** — roles come from `workspace_members` per request via RolesGuard, so role changes/removals apply immediately. JwtStrategy re-checks `is_active` in DB on every request.
- **`password_hash` is `select: false`** — it can never leak through a normal query; login opts in via explicit `addSelect`.
- **Signup is one transaction** (user + workspace + OWNER membership + session) with a 23505 catch for concurrent duplicate emails; login returns the same 401 for unknown email vs wrong password.
- **No `workspaces/` module yet** — workspace creation lives inside the signup transaction; the module appears with workspace CRUD.

## 2026-07-05 — Workspace & team management (phase 4)

- **Workspace context = `x-workspace-id` header, with a sole-membership fallback** in RolesGuard: one workspace → resolved automatically; several → the header is mandatory (guessing would be a tenant-isolation hazard). Route params (`:workspaceId`) still take precedence for future endpoints.
- **OWNER is unassignable via the API** — invite/role DTOs only accept ADMIN/AGENT, which structurally guarantees one owner per workspace; no runtime check needed.
- **Promotion to ADMIN is OWNER-only** (mirrors the invite rule); admins manage agents only; nobody edits the owner or themselves.
- **Member lookups are always scoped to the actor's workspace** — a foreign memberId 404s identically to a nonexistent one (no cross-tenant existence leaks).
- **Invites target existing users only** (per milestone) — email invitations arrive with the email phase.

## 2026-07-05 — Contacts & conversations (phases 5–6)

- **`conversation_assignments` history table added** — supersedes the earlier "current assignee only" decision (requirements now demand history). `conversations.assigned_to_user_id` stays as the denormalized current pointer; history user FKs are SET NULL so records outlive accounts.
- **`contacts.phone` added by migration** — required by the dashboard API; previously excluded as speculative.
- **No POST /contacts or /conversations** — both are born from the chat widget and email ingestion in later phases.
- **Contact email uniqueness enforced per-workspace in the service** — no DB constraint, since widget/email ingestion may need to merge duplicates later.
- **"Latest activity" = `COALESCE(last_message_at, created_at)`** — new conversations without messages still sort sensibly.
- **`offset/limit` instead of `skip/take`** for the conversation list — TypeORM's join-pagination subquery can't parse raw orderBy expressions; the contact join is many-to-one so raw pagination is safe.
- **Assignment writes are transactional** — history row + current-assignee update commit together.
