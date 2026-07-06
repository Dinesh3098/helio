import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    cached = pkg.version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}
