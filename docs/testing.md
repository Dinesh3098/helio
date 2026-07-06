# Testing

How the Helio test suite is organized, how to run it, and how to debug it.

## Quick start

```bash
pnpm test          # everything: API unit + integration, web, widget
```

Requirements: Docker running (integration tests provision their own PostgreSQL/Redis containers automatically) and dependencies installed (`pnpm install`).

## Architecture

| Layer           | Framework                           | Location                                   | What it proves                                           |
| --------------- | ----------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| API unit        | Jest (ts-jest)                      | `apps/api/src/**/*.spec.ts`                | Service/guard/provider logic with mocked dependencies    |
| API integration | Jest + Supertest + socket.io-client | `apps/api/test/*.int-spec.ts`              | Real AppModule against real PostgreSQL + Redis           |
| Dashboard       | Vitest + Testing Library (jsdom)    | `apps/web/**/*.test.ts(x)`                 | Stores, API client interceptors, forms                   |
| Chat widget     | Vitest + @testing-library/preact    | `packages/chat-widget/src/**/*.test.ts(x)` | Loader bootstrap, socket flows, composer, API layer      |
| End-to-end      | Playwright                          | `e2e/*.spec.ts`                            | Full product flows in a real browser vs the Docker stack |

### API test infrastructure

- `apps/api/jest.config.cjs` defines two projects: `unit` (no I/O, everything mocked) and `integration`.
- `apps/api/test/setup/global-setup.cjs` provisions the integration environment: reuses running `helio-test-pg`/`helio-test-redis` containers, else starts them (removed again in teardown unless it reused them or `KEEP_TEST_CONTAINERS=1`); runs all TypeORM migrations; sets test env (local storage in a temp dir, mock provider keys). Point `TEST_DATABASE_URL`/`TEST_REDIS_URL` at your own services to skip Docker entirely.
- **No table truncation, ever.** Every test file creates its own unique tenants through the public API (`test/helpers/factories.ts`), so files run in parallel against the shared database without interference.
- `test/helpers/test-app.ts` boots the real `AppModule` with the same pipes and request-context middleware as `main.ts` (`createListeningTestApp` for Socket.IO tests). `test/helpers/socket.ts` wraps socket.io-client (connect with agent/visitor auth, wait-for-event, emit-with-ack). `test/helpers/unit.ts` provides repository/config/fetch mocks for unit specs.
- **External providers are never called.** Gemini and Resend go through `global.fetch`, which every AI/email test stubs; S3 is mocked at the SDK level in unit tests and replaced by the local provider in integration.

## Commands

```bash
# Everything (turbo fans out to all packages)
pnpm test

# API only
pnpm --filter @helio/api test         # unit + integration
pnpm --filter @helio/api test:unit
pnpm --filter @helio/api test:int
pnpm --filter @helio/api test:int -- realtime        # one file
pnpm --filter @helio/api test:cov    # with coverage

# Frontend
pnpm --filter @helio/web test
pnpm --filter @helio/chat-widget test

# Coverage everywhere it's wired
pnpm --filter @helio/api test:cov && pnpm --filter @helio/web test:cov && pnpm --filter @helio/chat-widget test:cov
```

Coverage reports land in each package's `coverage/` directory (`lcov` + text summary + `json-summary`).

## End-to-end (Playwright)

E2E drives a real browser against the dockerized production build, on ports 3001/4001 so a local `pnpm dev` can keep running:

```bash
# 1. Boot the stack (NEXT_PUBLIC_API_URL is baked into the web build)
NEXT_PUBLIC_API_URL=http://localhost:4001 API_PORT=4001 WEB_PORT=3001 \
  docker compose --env-file .env.ci.example up -d --build --wait

# 2. Run the scenarios
pnpm exec playwright install chromium   # first time only
pnpm test:e2e

# 3. Tear down
docker compose --env-file .env.ci.example down -v
```

Scenarios covered in the browser: owner signup → workspace → login; widget↔agent realtime chat (two browser contexts); KB publish → public help center; tenant isolation through the UI. The remaining product flows (AI, email threading, automation→audit→timeline, attachments, role management) are exercised end-to-end at the HTTP+socket layer by the integration suite — see the mapping below.

## What lives where (spec ↔ coverage map)

| Area                            | Unit                                               | Integration                                               | E2E              |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| Auth/sessions                   | `auth.service.spec`                                | `auth`, `auth-sessions`                                   | `auth.spec`      |
| Workspaces/RBAC                 | `workspaces`, `workspace-members` specs            | `workspaces`, `workspace-members`                         | —                |
| Contacts/conversations/messages | service specs                                      | `contacts`, `conversations`, `messages`, `timeline`       | `chat.spec`      |
| Realtime                        | registry/limiter/emitter specs                     | `realtime` (connect/rooms/broadcast/typing/rate limits)   | `chat.spec`      |
| Widget                          | `widget-auth.service.spec` + widget package tests  | widget session/messages/attachments in several suites     | `chat.spec`      |
| Tenant isolation                | —                                                  | `workspace-isolation` (every resource)                    | `isolation.spec` |
| AI                              | `gemini.provider.spec`, `ai-rate-limit.guard.spec` | `ai` (cache, failure modes, 429)                          | —                |
| Email                           | `resend.provider.spec`                             | `email` (inbound, threading, terminal-resolved, outbound) | —                |
| KB                              | —                                                  | `kb` + public help center                                 | `kb.spec`        |
| Automation                      | —                                                  | `automation` (triggers, conditions, history)              | —                |
| Audit/metrics                   | `audit.service.spec`, `metrics.service.spec`       | `audit`                                                   | —                |
| Storage/uploads                 | storage service + both provider specs              | `attachments`                                             | —                |
| Performance smoke               | —                                                  | `perf-smoke` (100 sessions, 100 sockets, bursts)          | —                |

## CI integration

The `verify` job in `.github/workflows/ci.yml` runs `pnpm test` after the build step. Integration tests provision their containers via the global setup (Docker is available on GitHub runners). E2E runs in the `docker` job after the stack boots.

## Troubleshooting

| Symptom                                         | Fix                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker: command not found` in global setup     | Start Docker Desktop, or point `TEST_DATABASE_URL`/`TEST_REDIS_URL` at your own PostgreSQL/Redis                                                                                |
| Integration tests hang at startup               | First run pulls postgres/redis images — give it a minute; check `docker ps` for `helio-test-pg`                                                                                 |
| `migrations failed` in global setup             | The test database is dirty from an aborted experiment: `docker rm -f helio-test-pg` and rerun                                                                                   |
| Sporadic failures only when running many suites | Don't run two `pnpm test:int` invocations concurrently against the same containers                                                                                              |
| Jest hangs after a socket test                  | A socket wasn't disconnected; run with `--detectOpenHandles` to find it                                                                                                         |
| Playwright can't connect                        | The E2E stack isn't up or on different ports — see the E2E section; check `docker compose ps`                                                                                   |
| `You have hit the rate limit` in AI tests       | The guard's window is per user id; rerunning immediately reuses it — wait ~5 min or use a fresh run (factories create fresh users, so this only affects hand-run curl sessions) |

## Conventions for new tests

- Unit specs are colocated (`foo.service.spec.ts` next to `foo.service.ts`); mock exactly what the class injects.
- Integration specs get one Nest app per file; create data through the public API via the factories; never truncate or share ids across files.
- Always assert the real contract (status codes, response shapes) — read the controller before writing the test.
- External calls (`global.fetch`, AWS SDK) must be mocked in every path that could reach them.
