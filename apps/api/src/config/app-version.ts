import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

/**
 * Application version from apps/api/package.json. Resolved relative to
 * the compiled file (dist/config → package.json two levels up), which
 * holds both in the repo and inside the Docker image (/app/dist +
 * /app/package.json). Never throws — health/startup logging must not
 * fail because a file moved.
 */
export function appVersion(): string {
  if (cached !== null) return cached;
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"),
    ) as { version?: string };
    cached = pkg.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

export interface BuildInfo {
  version: string;
  commit: string;
  buildDate: string;
}

/**
 * Release metadata stamped into the image at Docker build time (GIT_SHA
 * and BUILD_DATE build args → env). Local/dev runs report "unknown" —
 * intentionally not required configuration.
 */
export function buildInfo(): BuildInfo {
  return {
    version: appVersion(),
    commit: process.env.GIT_SHA || "unknown",
    buildDate: process.env.BUILD_DATE || "unknown",
  };
}
