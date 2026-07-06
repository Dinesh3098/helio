# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** via [GitHub security advisories](https://github.com/Dinesh3098/helio/security/advisories/new) — never in a public issue or pull request. You can expect an acknowledgement within a few days.

Please include: affected component (API, dashboard, widget, worker), reproduction steps, and impact assessment if you have one.

## Supported versions

Helio is pre-1.0; only the latest commit on the default branch is supported.

## Repository security posture

The following should be enabled in **Settings → Code security and analysis** (they are repository settings and cannot be turned on from files in the repo):

- **Secret scanning** + **push protection** — blocks committed credentials before they land.
- **Dependency graph** + **Dependabot alerts** — advisory notifications for the dependency tree.

Automated, already configured in the repo:

- **Dependabot version updates** (`.github/dependabot.yml`) — weekly, grouped, patch-noise filtered.
- **Dependency review** (`.github/workflows/dependency-review.yml`) — PRs introducing high/critical-vulnerable packages fail.
- **`pnpm audit --audit-level high`** in CI — the build fails on high/critical advisories in the lockfile; low/moderate are reported but don't block.

## Handling secrets

- Real credentials live only in local `.env` files (gitignored) or your deployment platform's secret store — never in the repository, workflows, or compose files.
- The committed `*.example` env files must contain placeholders only.
- CI runs entirely on mock values (`.env.ci.example`); release registry credentials belong in GitHub Actions secrets (`REGISTRY_USERNAME` / `REGISTRY_PASSWORD`).
- If a secret does leak into history: rotate it immediately first, then rewrite history.
