// oclif resolves commands relative to the package.json it finds by walking up
// from the entry point, so we keep the bin shim as the sole "build" artifact
// and let oclif load commands from src/commands/ at runtime.
import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(here, "bin/run.js"), resolve(dist, "cli.mjs"));

// Pre-build the oclif manifest so `--help` and unrelated commands do not have
// to import every command class to read its description. This mirrors the
// recommended production setup for oclif CLIs.
const r = spawnSync("vp", ["exec", "oclif", "manifest"], {
  cwd: here,
  stdio: "inherit",
});
if (r.status !== 0) {
  throw new Error(`oclif manifest exited with ${r.status}`);
}
