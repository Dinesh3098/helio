import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for Docker: .next/standalone carries the
  // app plus only the node_modules it actually imports.
  output: "standalone",
  // Monorepo root, so file tracing resolves pnpm's hoisted store instead
  // of guessing from the lockfile location.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
