import { defineConfig } from "@playwright/test";

/**
 * E2E against the dockerized stack (see docs/testing.md):
 *
 *   NEXT_PUBLIC_API_URL=http://localhost:4001 API_PORT=4001 WEB_PORT=3001 \
 *     docker compose --env-file .env.ci.example up -d --build --wait
 *   pnpm exec playwright test
 *
 * Ports 3001/4001 by default so a local `pnpm dev` on 3000/4000 can keep
 * running; override with E2E_WEB_URL / E2E_API_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // scenarios share one backend; serial keeps them deterministic
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
});
