# Contributing to Helio

Thanks for your interest in improving Helio. This document covers everything you need to get a change from idea to merged PR.

## Getting set up

Prerequisites: Node.js ≥ 20 and pnpm 9 (`corepack enable` gives you the pinned version from `package.json#packageManager`).

```bash
git clone git@github.com:Dinesh3098/helio.git
cd helio
pnpm install
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, JWT_SECRET
pnpm dev                    # starts api (:4000) and web (:3000) via turbo
```

For a fully containerized run (no local services needed), see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Repository layout

| Path                    | What lives there                                       |
| ----------------------- | ------------------------------------------------------ |
| `apps/api`              | NestJS backend (REST + Socket.IO + TypeORM migrations) |
| `apps/web`              | Next.js dashboard (also serves the widget bundles)     |
| `packages/chat-widget`  | Embeddable Preact chat widget (vite IIFE bundles)      |
| `packages/config`       | Shared ESLint + TypeScript configuration               |
| `packages/shared`       | Shared types/utilities                                 |
| `packages/email-worker` | Cloudflare Email Worker (deployed separately)          |

## Development workflow

1. Branch from `develop`: `git checkout -b feat/short-description`
2. Make your change, keeping the existing architecture: DTO validation at the edges, business logic in services, provider abstractions for external vendors (AI/email/storage).
3. Verify locally — the same checks CI runs:

   ```bash
   pnpm format:check   # prettier
   pnpm lint           # eslint, zero warnings allowed
   pnpm check-types    # tsc across all packages
   pnpm build          # turbo build of every package
   pnpm audit --audit-level high
   ```

4. Open a PR against `develop` and fill in the template.

## Conventions

- **Commits** follow Conventional Commits: `feat(api): …`, `fix(web): …`, `chore(ci): …`. Scope by app/package.
- **Formatting** is Prettier-enforced repo-wide; run `pnpm format` before committing.
- **Lint** must pass with `--max-warnings 0`.
- **Database changes** always ship as a TypeORM migration in `apps/api/src/database/migrations/` (generate with `pnpm --filter @helio/api migration:generate src/database/migrations/<Name>`). `synchronize` is permanently off.
- **Environment variables**: add new ones to `src/config/configuration.ts` + `env.validation.ts`, and document them in `.env.example`, `.env.production.example`, and `.env.ci.example`. Required-at-boot config belongs in the Joi schema; optional providers must degrade gracefully instead of blocking startup.
- **Generated files** (`dist/`, `.next/`, widget bundles in `apps/web/public/`) are never committed — CI rejects them.
- **Secrets** never enter the repository. `.env*` files are gitignored (only the `*.example` files are tracked).

## Testing your change

There is no unit-test suite yet (the `test` turbo task is wired for when suites land). Until then, PRs must describe manual verification — for API changes include the curl commands or Postman steps you ran; for UI changes include screenshots. The Docker CI job boots the full stack and probes health, dashboard, widget, and Socket.IO on every PR.

## Questions

Open a [discussion](https://github.com/Dinesh3098/helio/discussions) for anything that isn't a bug report or feature request. Security issues go through [private disclosure](./SECURITY.md) — never a public issue.
