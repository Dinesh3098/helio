# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/web/Dockerfile .
# The chat widget is built first because its bundles (widget.js,
# widget-app.js) are copied into apps/web/public and served by the
# dashboard — the /demo page and external embeds load them from there.

FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

# ---------------------------------------------------------------- build
FROM base AS build
WORKDIR /repo

# Manifests only — the install layer is cached until the lockfile changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/chat-widget/package.json packages/chat-widget/
COPY packages/config/package.json packages/config/
COPY packages/email-worker/package.json packages/email-worker/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @helio/web... --filter @helio/chat-widget...

COPY packages/config packages/config
COPY packages/chat-widget packages/chat-widget
COPY apps/web apps/web

# Widget bundles land in apps/web/public via the package's sync script.
RUN pnpm --filter @helio/chat-widget build

# NEXT_PUBLIC_* values are inlined into the client bundle at build time —
# they must be provided as build args, not runtime environment.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_DEMO_WORKSPACE_ID=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEMO_WORKSPACE_ID=$NEXT_PUBLIC_DEMO_WORKSPACE_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @helio/web build

# -------------------------------------------------------------- runtime
FROM node:26-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Next standalone output: the server plus only the node_modules it
# actually imports. Static assets and public/ are served by the same
# process and are copied alongside.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000)).then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
