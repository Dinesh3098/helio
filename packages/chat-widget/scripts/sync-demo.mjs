// Copies the built bundles into the dashboard's public/ directory so the
// /demo page can embed the widget from the same origin during review.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const webPublic = join(here, "..", "..", "..", "apps", "web", "public");

mkdirSync(webPublic, { recursive: true });
for (const file of ["widget.js", "widget-app.js"]) {
  copyFileSync(join(dist, file), join(webPublic, file));
  console.log(`copied ${file} -> apps/web/public/`);
}
