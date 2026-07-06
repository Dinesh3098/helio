#!/bin/sh
# Migration gate: TypeORM migrations run against the compiled datasource
# before NestJS boots. `set -e` makes any migration failure abort the
# container (non-zero exit), so the restart policy retries from scratch
# and the API never serves against a half-migrated schema.
set -e

echo "[entrypoint] Running database migrations..."
node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run

echo "[entrypoint] Migrations complete — starting API"
exec node dist/main.js
