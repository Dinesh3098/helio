# syntax=docker/dockerfile:1
# Build from the repository root:
#   docker build -f packages/chat-widget/Dockerfile .
#
# Standalone static host for the widget bundles. The default deployment
# does NOT need this image — the dashboard already serves /widget.js and
# /widget-app.js from its public directory. Use this when the widget
# should be served from a dedicated origin/CDN, e.g.:
#   <script src="https://widget.example.com/widget.js"></script>

FROM node:22-alpine AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/chat-widget/package.json packages/chat-widget/
COPY packages/config/package.json packages/config/
COPY packages/email-worker/package.json packages/email-worker/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @helio/chat-widget...

COPY packages/config packages/config
COPY packages/chat-widget packages/chat-widget

RUN pnpm --filter @helio/chat-widget build

# -------------------------------------------------------------- runtime
# nginx-unprivileged runs as a non-root user (uid 101) on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY packages/chat-widget/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/chat-widget/dist/widget.js /usr/share/nginx/html/
COPY --from=build /repo/packages/chat-widget/dist/widget-app.js /usr/share/nginx/html/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
