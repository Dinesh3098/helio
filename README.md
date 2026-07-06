# Helio

AI-powered customer communication platform. Helio lets businesses talk to their customers through an embeddable chat widget, with AI assistance, real-time messaging, and email follow-ups.

## Tech Stack

| Layer           | Technology                                   |
| --------------- | -------------------------------------------- |
| Monorepo        | Turborepo + pnpm workspaces                  |
| Frontend        | Next.js 15 (App Router), React 19, TypeScript |
| Backend         | NestJS, TypeScript, TypeORM                  |
| Database        | PostgreSQL (Neon)                            |
| Cache / Queues  | Redis (Upstash), BullMQ                      |
| Realtime        | Socket.IO                                    |
| Email           | Resend                                       |
| AI              | Gemini                                       |

## Monorepo Structure

```
helio/
├── apps/
│   ├── api/            # NestJS backend
│   └── web/            # Next.js dashboard
├── packages/
│   ├── chat-widget/    # Embeddable customer-facing chat widget
│   ├── shared/         # Shared types, constants, and utilities
│   └── config/         # Shared ESLint and TypeScript configuration
├── docs/               # Project documentation
└── .github/workflows/  # CI pipelines
```

All workspace packages are namespaced under `@helio/*`.

## Deploy with Docker

The whole platform (API, dashboard, widget, PostgreSQL, Redis) runs with one command:

```sh
cp .env.production.example .env   # set JWT_SECRET at minimum
docker compose up --build
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full guide (environment reference, health semantics, troubleshooting, production notes).

## Setup

Requirements: Node.js >= 20, pnpm 9 (`corepack enable`).

```sh
pnpm install
cp .env.example .env   # then fill in the values
pnpm dev
```

The web app runs at [http://localhost:3000](http://localhost:3000).

## Development Commands

Run from the repository root:

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `pnpm dev`         | Start all apps in development mode |
| `pnpm build`       | Build all apps and packages        |
| `pnpm lint`        | Lint all workspaces                |
| `pnpm test`        | Run tests in all workspaces        |
| `pnpm check-types` | Type-check all workspaces          |
| `pnpm format`      | Format the codebase with Prettier  |

Target a single workspace with a filter, e.g. `pnpm dev --filter=@helio/web`.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system design
- [`docs/api.md`](docs/api.md) — API reference
- [`docs/decisions.md`](docs/decisions.md) — decision log
