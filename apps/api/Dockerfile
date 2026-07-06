# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f apps/api/Dockerfile .
# node:22-slim (glibc) rather than alpine: bcrypt ships prebuilt glibc
# binaries, so no compiler toolchain is needed in any stage.

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

# ---------------------------------------------------------------- build
FROM base AS build
WORKDIR /repo

# Manifests only, so the dependency layer is cached until a manifest or
# the lockfile changes — source edits never trigger a reinstall.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/chat-widget/package.json packages/chat-widget/
COPY packages/config/package.json packages/config/
COPY packages/email-worker/package.json packages/email-worker/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @helio/api...

COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @helio/api build

# Pruned, self-contained output: package files (dist only, per the
# "files" field) plus production dependencies — no dev toolchain.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @helio/api deploy --prod /out

# -------------------------------------------------------------- runtime
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /out ./
COPY --chown=node:node --chmod=755 apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

# Local-provider uploads land here; docker-compose mounts a named volume
# over it (ownership is seeded from this directory on first mount).
RUN mkdir -p /app/storage && chown node:node /app/storage

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

# Runs migrations first and refuses to start the API if they fail.
ENTRYPOINT ["./docker-entrypoint.sh"]
