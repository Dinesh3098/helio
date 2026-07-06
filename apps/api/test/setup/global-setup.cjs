/**
 * Integration-test environment. Resolution order:
 *
 *  1. TEST_DATABASE_URL + TEST_REDIS_URL set        → use them verbatim
 *  2. helio-test-pg / helio-test-redis running      → reuse them
 *  3. otherwise                                     → docker run both
 *     (removed again in global-teardown unless KEEP_TEST_CONTAINERS=1)
 *
 * Migrations run every time (idempotent — "no pending" is instant).
 * Environment set here propagates to Jest workers, which fork after
 * globalSetup completes.
 */
const { execSync, spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const PG_NAME = "helio-test-pg";
const REDIS_NAME = "helio-test-redis";
const PG_PORT = 55433;
const REDIS_PORT = 55379;
const STATE_FILE = path.join(tmpdir(), "helio-test-containers.json");

const sh = (cmd) =>
  execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();

const isRunning = (name) => {
  try {
    return sh(`docker inspect -f "{{.State.Running}}" ${name}`) === "true";
  } catch {
    return false;
  }
};

module.exports = async function globalSetup() {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let redisUrl = process.env.TEST_REDIS_URL;
  const created = [];

  if (!databaseUrl || !redisUrl) {
    if (!isRunning(PG_NAME)) {
      sh(
        `docker run -d --name ${PG_NAME} -e POSTGRES_PASSWORD=test -e POSTGRES_DB=helio_test -p ${PG_PORT}:5432 postgres:16-alpine`,
      );
      created.push(PG_NAME);
    }
    if (!isRunning(REDIS_NAME)) {
      sh(
        `docker run -d --name ${REDIS_NAME} -p ${REDIS_PORT}:6379 redis:7-alpine`,
      );
      created.push(REDIS_NAME);
    }
    databaseUrl = `postgresql://postgres:test@localhost:${PG_PORT}/helio_test`;
    redisUrl = `redis://localhost:${REDIS_PORT}`;

    // Wait for Postgres to accept connections (fresh containers only).
    const deadline = Date.now() + 30000;
    for (;;) {
      try {
        sh(`docker exec ${PG_NAME} pg_isready -U postgres`);
        break;
      } catch (error) {
        if (Date.now() > deadline) throw error;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify({ created }));

  // Test process environment — inherited by every Jest worker. Explicit
  // values here always win over anything dotenv loads from repo .env files.
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.JWT_SECRET = "helio-integration-test-secret-0123456789abcdef";
  process.env.JWT_ACCESS_EXPIRES_IN = "15m";
  process.env.JWT_REFRESH_EXPIRES_IN_DAYS = "30";
  process.env.STORAGE_PROVIDER = "local";
  process.env.STORAGE_LOCAL_DIR = mkdtempSync(
    path.join(tmpdir(), "helio-test-storage-"),
  );
  process.env.STORAGE_MAX_FILE_SIZE_MB = "10";
  // Mock keys: providers consider themselves configured; tests stub
  // global.fetch — nothing ever reaches Gemini/Resend.
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.CORS_ORIGINS = "";

  const migrate = spawnSync("pnpm", ["typeorm", "migration:run"], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (migrate.status !== 0) {
    throw new Error(
      `test-db migrations failed:\n${migrate.stdout}\n${migrate.stderr}`,
    );
  }
};
