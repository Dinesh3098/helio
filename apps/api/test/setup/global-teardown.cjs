const { execSync } = require("node:child_process");
const { existsSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const STATE_FILE = path.join(tmpdir(), "helio-test-containers.json");

/**
 * Removes only the containers global-setup created in this run.
 * Pre-existing (reused) containers are left alone so local watch-mode
 * runs stay fast. Set KEEP_TEST_CONTAINERS=1 to keep everything.
 */
module.exports = async function globalTeardown() {
  if (!existsSync(STATE_FILE)) return;
  const { created } = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  rmSync(STATE_FILE, { force: true });
  if (process.env.KEEP_TEST_CONTAINERS === "1") return;
  for (const name of created) {
    try {
      execSync(`docker rm -f ${name}`, { stdio: "ignore" });
    } catch {
      // best effort — a leftover container is annoying, not fatal
    }
  }
};
