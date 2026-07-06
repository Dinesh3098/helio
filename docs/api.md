# Helio — API Reference

Base URL: `https://api.dineshbhadane.com` (production) or `http://localhost:4000` (local). Interactive Swagger UI is available at `/docs` **in development only**.

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` (agents) — obtain via `/auth/login`. Widget endpoints use `Bearer <visitorToken>` from `/widget/session`.
- **Tenancy**: workspace-scoped routes take `x-workspace-id: <uuid>`; optional when the user belongs to exactly one workspace. Non-membership → `403`; foreign resource ids → `404`.
- **Validation**: unknown body properties are rejected (`400`). Errors return `{ message, error, statusCode, timestamp, path }`; validation errors carry `message: string[]`.
- **Pagination**: list endpoints take `page`/`limit` (offset) — messages use keyset cursors (`nextCursor`, pass back as `cursor`).
- A Postman collection with examples lives at [helio.postman_collection.json](helio.postman_collection.json). Realtime (Socket.IO) events are documented in [realtime.md](realtime.md).

## Auth — `/auth`

| Method | Path            | Auth   | Description                                                                                                                                     |
| ------ | --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/signup`  | —      | Create account + first workspace + session. Body: `{name, email, password, workspaceName}` → `201 {user, workspace, accessToken, refreshToken}` |
| POST   | `/auth/login`   | —      | `{email, password}` → `200` with fresh token pair. Wrong credentials → `401`                                                                    |
| POST   | `/auth/refresh` | —      | `{refreshToken}` → `200` with **rotated** pair; the presented token is invalidated (reuse → `401`)                                              |
| POST   | `/auth/logout`  | —      | `{refreshToken}` → `204`; revokes that session only                                                                                             |
| GET    | `/auth/me`      | Bearer | Current user profile                                                                                                                            |

## Workspace — `/workspace`

| Method | Path              | Roles      | Description                                             |
| ------ | ----------------- | ---------- | ------------------------------------------------------- |
| GET    | `/workspace/mine` | any member | All workspaces the caller belongs to (for the switcher) |
| GET    | `/workspace`      | any        | Current workspace detail                                |
| PATCH  | `/workspace`      | OWNER      | Rename. `{name}`                                        |

### Members — `/workspace/members`

| Method | Path                           | Roles        | Description                                                                     |
| ------ | ------------------------------ | ------------ | ------------------------------------------------------------------------------- |
| GET    | `/workspace/members`           | any          | List members with roles                                                         |
| POST   | `/workspace/members`           | OWNER, ADMIN | Invite an **existing** user by email. `{email, role}`                           |
| PATCH  | `/workspace/members/:memberId` | OWNER, ADMIN | Change role. The last OWNER cannot be demoted                                   |
| DELETE | `/workspace/members/:memberId` | OWNER, ADMIN | Remove member (`204`); their tokens stop working for this workspace immediately |

## Contacts — `/contacts`

| Method | Path                             | Description                                        |
| ------ | -------------------------------- | -------------------------------------------------- |
| GET    | `/contacts?search=&page=&limit=` | List/search workspace contacts                     |
| GET    | `/contacts/:id`                  | Profile with conversation stats                    |
| PATCH  | `/contacts/:id`                  | Update `{name?, email?, phone?}`                   |
| GET    | `/contacts/:id/conversations`    | The contact's conversations, newest activity first |

## Inbox (Conversations) — `/conversations`

| Method | Path                                                                               | Description                                                                                                |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/conversations?status=&priority=&assignedToUserId=&channel=&search=&page=&limit=` | Filtered inbox list (denormalized previews)                                                                |
| GET    | `/conversations/:id`                                                               | Detail: contact, assignee, AI summary, counts                                                              |
| GET    | `/conversations/:id/timeline`                                                      | Messages + audit events interleaved chronologically                                                        |
| PATCH  | `/conversations/:id`                                                               | Update `{status?, priority?}`                                                                              |
| POST   | `/conversations/:id/assign`                                                        | `{workspaceMemberId}` or `{workspaceMemberId: null}` to unassign. Agents may only self-assign/self-release |
| POST   | `/conversations/:id/resolve`                                                       | Status → RESOLVED (terminal: visitors/emails start fresh threads afterward)                                |
| POST   | `/conversations/:id/snooze`                                                        | Status → SNOOZED (any new message reopens)                                                                 |
| POST   | `/conversations/:id/reopen`                                                        | Status → OPEN                                                                                              |

## Messages — `/conversations/:conversationId/messages`

| Method | Path                        | Description                                                                                                                                    |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `…/messages?limit=&cursor=` | Keyset-paginated, oldest→newest; `nextCursor` walks older pages                                                                                |
| POST   | `…/messages`                | Agent send. `{content?, attachmentIds?}` (text or attachments required). Resolved conversation → `409`; snoozed reopens. Broadcasts to sockets |

## Widget (public / visitor-token) — `/widget`

| Method | Path                               | Auth    | Description                                                                                                                 |
| ------ | ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/widget/session`                  | —       | `{workspaceId, visitorId}` → `200 {visitorToken, conversationId, …}`. Idempotent find-or-create (deliberately 200, not 201) |
| GET    | `/widget/messages?limit=&cursor=`  | visitor | The visitor's own conversation history                                                                                      |
| POST   | `/widget/messages`                 | visitor | REST fallback send. `{content?, attachmentIds?}`                                                                            |
| POST   | `/widget/attachments`              | visitor | Multipart `file` upload into the visitor's conversation                                                                     |
| GET    | `/widget/attachments/:id/download` | visitor | Download from the visitor's own conversation only                                                                           |

## Email — `/email`

| Method | Path                                        | Auth         | Description                                                                                                   |
| ------ | ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/email/accounts`                           | agent        | Workspace mailboxes                                                                                           |
| POST   | `/email/accounts`                           | OWNER, ADMIN | Register mailbox `{email, displayName?}` — routes inbound mail to this workspace                              |
| PATCH  | `/email/accounts/:id`                       | OWNER, ADMIN | Update display name / status                                                                                  |
| DELETE | `/email/accounts/:id`                       | OWNER, ADMIN | Remove mailbox                                                                                                |
| POST   | `/email/conversations/:conversationId/send` | agent        | Outbound reply via Resend with proper threading headers. `{content}`                                          |
| POST   | `/email/webhook`                            | — (provider) | Inbound email ingestion (called by the Cloudflare worker). Unknown recipient mailbox → `404`, nothing created |

## Knowledge Base — `/kb` (agent) and `/help` (public)

| Method   | Path                                                     | Description                                                                                                                  |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET/POST | `/kb/categories` · GET/PATCH/DELETE `/kb/categories/:id` | Category CRUD (delete → `204`)                                                                                               |
| GET      | `/kb/articles?search=&categoryId=&published=&page=`      | List with filters + search                                                                                                   |
| GET/POST | `/kb/articles` · GET/PATCH/DELETE `/kb/articles/:id`     | Article CRUD; `{title, content, categoryId, excerpt?, isPublished?}`; slug auto-generated; publish via PATCH `{isPublished}` |
| GET      | `/help?workspaceId=`                                     | Public: categories + published articles                                                                                      |
| GET      | `/help/search?workspaceId=&q=`                           | Public weighted full-text search (published only)                                                                            |
| GET      | `/help/articles/:slug?workspaceId=`                      | Public article by slug (drafts invisible)                                                                                    |

## AI — `/ai` (agent; rate-limited 30 req / 5 min / user → `429`)

| Method | Path                             | Description                                                                            |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/ai/conversations/:id/summary`  | Cached summary (`404` if none generated yet)                                           |
| POST   | `/ai/conversations/:id/summary`  | Generate — returns the cached one while fresh (no provider call)                       |
| POST   | `/ai/conversations/:id/reply`    | Draft a suggested reply. `{instructions?}` — never auto-sent                           |
| POST   | `/ai/rewrite`                    | `{draft, style}` — style ∈ PROFESSIONAL, FRIENDLY, SHORTER, … (`400` on unknown style) |
| POST   | `/ai/conversations/:id/classify` | `{category, priority, sentiment, intent}` from structured JSON output                  |
| POST   | `/ai/conversations/:id/kb`       | Suggest relevant **published** KB articles                                             |

Provider failures map to HTTP errors (timeout/quota/malformed) without crashing; missing `GEMINI_API_KEY` → `503` feature-unavailable.

## Automation — `/automation`

| Method       | Path                               | Description                                                                                                                                                       |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST     | `/automation/rules`                | List / create. `{name, trigger, enabled?, conditions: [...], actions: [...]}` — typed shapes validated at runtime (`400` with a precise message on invalid types) |
| PATCH/DELETE | `/automation/rules/:id`            | Update / delete                                                                                                                                                   |
| POST         | `/automation/rules/:id/test`       | Dry-run a rule against a conversation                                                                                                                             |
| GET          | `/automation/history?page=&limit=` | Execution log (SUCCESS/FAILED with error text)                                                                                                                    |

Triggers: `CONVERSATION_CREATED`, `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `CONVERSATION_RESOLVED`, `CONVERSATION_REOPENED`. Conditions: `channel`, `status`, `priority`, `emailDomain`, `messageContains`, `assignedTo`, `timeOfDay`. Actions: `assign`, `setPriority`, `setStatus`, `addTag`, `removeTag`, `autoReply`, `aiSummary`, `aiReply`.

## Attachments — `/attachments` (agent)

| Method | Path                        | Description                                                                                                                               |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/attachments`              | Multipart `file` (+ optional `conversationId`). Allowlist: png/jpeg/gif/webp/pdf/doc(x)/txt/csv; size cap → `413`; forbidden type → `415` |
| GET    | `/attachments/:id`          | Metadata                                                                                                                                  |
| GET    | `/attachments/:id/download` | S3 → `302` presigned URL; local → streamed bytes                                                                                          |
| DELETE | `/attachments/:id`          | Remove object + row                                                                                                                       |

## Audit — `/audit`

| Method | Path                                                  | Description                                                                         |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/audit/logs?resourceType=&actorUserId=&page=&limit=` | Workspace trail, newest first: action, actor, resource, metadata, IP/UA, request id |

## Admin & Observability

| Method | Path            | Auth         | Description                                                                                                   |
| ------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/system` | OWNER, ADMIN | Live system snapshot (sockets, memory, uptime)                                                                |
| GET    | `/health`       | —            | Full component report; `200 ok/degraded`, `503 down` (see [architecture.md §8](architecture.md#8-deployment)) |
| GET    | `/metrics`      | —            | Prometheus exposition                                                                                         |
