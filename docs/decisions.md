# Decision Log

> Significant technical decisions and their rationale are recorded here.

## 2026-07-05 — Monorepo scaffold

- **Turborepo + pnpm workspaces** for the monorepo: task caching, parallel builds, and first-class pnpm support.
- **Single `@helio/config` package** for shared ESLint and TypeScript configs instead of separate `eslint-config` / `typescript-config` packages, keeping the workspace list small.
- **Next.js pinned to 15.x** per project requirements (create-turbo defaults to the latest major).
- **No `packages/ui` yet** — an empty component library is an abstraction with no consumers. It will be created when shadcn/ui is introduced.
