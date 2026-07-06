# CI/CD

How the Helio repository verifies, packages, and releases itself.

## Overview

```
push / PR to main, master, develop
        │
        ▼
┌──────────────────────────┐     ┌──────────────────────────────┐
│ CI: verify               │────▶│ CI: docker                   │
│  install (frozen lock)   │     │  cp .env.ci.example .env     │
│  generated-files check   │     │  docker compose build        │
│  prettier --check        │     │  docker compose up --wait    │
│  eslint (0 warnings)     │     │  probe /health, dashboard,   │
│  tsc across packages     │     │  widget bundles, socket.io   │
│  turbo build (all pkgs)  │     │  docker compose down -v      │
│  pnpm audit (high+)      │     └──────────────────────────────┘
│  artifacts upload        │
└──────────────────────────┘     ┌──────────────────────────────┐
                                 │ Dependency Review (PRs only) │
tag v* / manual dispatch         │  fails on high/critical deps │
        │                        └──────────────────────────────┘
        ▼
┌──────────────────────────┐
│ Release                  │
│  verify (lint/types/build)│
│  buildx build api + web  │
│  tag semver + sha + latest│
│  push to registry        │
└──────────────────────────┘
```

Workflows live in `.github/workflows/`:

| Workflow                | Trigger                                  | Purpose                                     |
| ----------------------- | ---------------------------------------- | ------------------------------------------- |
| `ci.yml`                | push / PR to `main`, `master`, `develop` | Full verification of the monorepo + Docker  |
| `dependency-review.yml` | PRs                                      | Block high/critical vulnerable dependencies |
| `release.yml`           | tags `v*`, manual dispatch               | Build, tag, and push production images      |

## CI stages (`ci.yml`)

### Job 1 — `verify`

1. **Checkout**, **pnpm setup** (`pnpm/action-setup` reads the pinned version from `package.json#packageManager` — no drift between CI and local), **Node 22** with the pnpm store cache.
2. **`pnpm install --frozen-lockfile`** — doubles as the lockfile-consistency gate: the install fails if `pnpm-lock.yaml` doesn't match the workspace manifests.
3. **Generated-files check** — fails if `dist/`, `.next/`, `.turbo/`, widget bundles, or `*.tsbuildinfo` are committed.
4. **`pnpm format:check`** — Prettier, repo-wide.
5. **`pnpm lint`** — ESLint with `--max-warnings 0` in every package.
6. **`pnpm check-types`** — `tsc --noEmit` in every package.
7. **`pnpm build`** — turbo builds every package; any failure fails the job. Output is captured to `build.log`.
8. **`pnpm audit --audit-level high`** — fails only on high/critical advisories; low/moderate are reported without blocking.
9. **Artifacts** — uploads `build-metadata.json` (version, git SHA, ref, timestamp, node/pnpm versions, run id), the production build log, and a coverage placeholder. Retention: 14 days.

### Job 2 — `docker` (needs `verify`)

Copies `.env.ci.example` → `.env` (mock values only — no real credentials anywhere in CI), then:

- `docker compose build` (passes `GIT_SHA` + `BUILD_DATE` build args — surfaced later by `/health`)
- `docker compose up -d --wait` — compose's health-gated startup: postgres + redis healthy → API runs TypeORM migrations → boots → web starts
- Probes: `GET /health` must return `ok` or `degraded` with database + redis `up`; dashboard `/login`, `/widget.js`, `/widget-app.js` must serve; a Socket.IO polling handshake must succeed
- On failure the last 100 log lines of every container are printed; teardown always runs `down -v`

## Caching strategy

| Cache                | Key                                                 | Effect                                                                                                |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| pnpm store           | `pnpm-lock.yaml` hash                               | `pnpm install` reuses downloaded packages                                                             |
| Docker layer caching | Dockerfile layer digests                            | Dependency layers rebuilt only when the lockfile or manifests change (manifest-first `COPY` ordering) |
| Release image cache  | GitHub Actions cache (`type=gha`), scoped per image | Buildx reuses layers across release runs                                                              |

Turbo's local cache also works in CI within a run; remote caching (Vercel/self-hosted) can be added later via `TURBO_TOKEN`/`TURBO_TEAM` without workflow changes.

## Release process (`release.yml`)

1. Tag a release: `git tag v0.2.0 && git push origin v0.2.0` (or run the workflow manually with a tag input).
2. The `verify` job re-runs lint/types/build.
3. The `images` job builds `helio-api` and `helio-web` with buildx and pushes them tagged `<version>`, `sha-<short>`, and `latest`, stamped with `GIT_SHA`/`BUILD_DATE` (visible at `GET /health` as `commit` / `buildDate`).

### Registry configuration — where credentials belong

No registry is hardcoded. Configure in **Settings → Secrets and variables → Actions**:

| Kind     | Name                 | Value                                                                        |
| -------- | -------------------- | ---------------------------------------------------------------------------- |
| Variable | `CONTAINER_REGISTRY` | e.g. `docker.io/<user>` or `ghcr.io/<org>` (default: `ghcr.io/<repo owner>`) |
| Secret   | `REGISTRY_USERNAME`  | Registry login (omit for ghcr.io — falls back to `github.actor`)             |
| Secret   | `REGISTRY_PASSWORD`  | Registry access token (omit for ghcr.io — falls back to `GITHUB_TOKEN`)      |

Never put registry credentials in workflow files, compose files, or `.env*` examples.

## Security

- **Secret scanning + push protection**: enable in Settings → Code security and analysis (see `SECURITY.md`).
- **Dependency review** on every PR fails on high/critical advisories in newly introduced packages.
- **`pnpm audit`** gates CI at high severity. Transitive advisories are fixed via `pnpm.overrides` in the root `package.json` (see the existing overrides for the pattern).
- **Dependabot** (`.github/dependabot.yml`): weekly npm + GitHub Actions + Docker base-image updates, grouped (`@nestjs/*`, `@aws-sdk/*`, react/next, tooling, tailwind), patch releases ignored to avoid noise — security alerts still arrive immediately.

## Running CI locally

Every gate is a plain command — no GitHub-specific magic:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm check-types
pnpm build
pnpm audit --audit-level high

# Docker job equivalent:
cp .env.ci.example .env
docker compose build
docker compose up -d --wait
curl -fsS http://localhost:4000/health
docker compose down -v
```

To execute the actual workflow files locally, [`act`](https://github.com/nektos/act) works: `act pull_request -W .github/workflows/ci.yml`.

## Debugging CI failures

| Symptom                                  | Where to look / what it means                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install` fails with lockfile error | `pnpm-lock.yaml` is out of sync — run `pnpm install` locally and commit the lockfile                              |
| Format check fails                       | Run `pnpm format`, commit                                                                                         |
| "Generated files are committed"          | `git rm --cached <file>` — build outputs are never tracked                                                        |
| Audit failure                            | `pnpm audit` locally; fix by upgrading or adding a targeted `pnpm.overrides` entry with the patched version       |
| Docker job: `dependency failed to start` | A container went unhealthy — the workflow prints `docker compose logs`; migration errors abort the API by design  |
| Docker job: health probe fails           | Check the `Show logs on failure` step output; reproduce locally with the same `.env.ci.example`                   |
| Release push fails with 401/403          | Registry variables/secrets missing or wrong (see table above); for ghcr.io check the `packages: write` permission |

Artifacts (`build-metadata.json`, `build.log`) are attached to every CI run — Actions → the run → Artifacts.
