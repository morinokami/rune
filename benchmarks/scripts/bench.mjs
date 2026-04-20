#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const fixtures = [
  { name: "rune", dir: resolve(root, "fixtures/rune") },
  { name: "commander", dir: resolve(root, "fixtures/commander") },
  { name: "yargs", dir: resolve(root, "fixtures/yargs") },
  { name: "citty", dir: resolve(root, "fixtures/citty") },
  { name: "oclif", dir: resolve(root, "fixtures/oclif") },
  { name: "gunshi", dir: resolve(root, "fixtures/gunshi") },
];

const scenarios = [
  { id: "help", args: ["--help"] },
  { id: "add", args: ["math", "add", "1", "2"] },
  { id: "heavy", args: ["heavy"] },
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with ${r.status}`);
  }
}

function hyperfineAvailable() {
  try {
    execSync("hyperfine --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hyperfineAvailable()) {
  console.error("hyperfine not found on PATH. Install from https://github.com/sharkdp/hyperfine");
  process.exit(1);
}

for (const f of fixtures) {
  console.log(`\n=== build: ${f.name} ===`);
  run("vp", ["run", "--filter", `./benchmarks/fixtures/${f.name}`, "build"], {
    cwd: resolve(root, ".."),
  });
}

const resultsDir = resolve(root, "results");
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const all = { stamp, runs: [] };

for (const s of scenarios) {
  const commands = fixtures.map((f) => {
    const entry = resolve(f.dir, "dist/cli.mjs");
    if (!existsSync(entry)) {
      throw new Error(`missing build artifact: ${entry}`);
    }
    return `node ${entry} ${s.args.join(" ")}`;
  });

  const exportPath = resolve(resultsDir, `${stamp}-${s.id}.json`);
  console.log(`\n=== scenario: ${s.id} ===`);
  run("hyperfine", [
    "--warmup",
    "3",
    "--export-json",
    exportPath,
    "--command-name",
    fixtures[0].name,
    commands[0],
    ...fixtures.slice(1).flatMap((f, i) => ["--command-name", f.name, commands[i + 1]]),
  ]);
  all.runs.push({ scenario: s.id, exportPath });
}

const indexPath = resolve(resultsDir, `${stamp}-index.json`);
writeFileSync(indexPath, JSON.stringify(all, null, 2));
console.log(`\nResults written under ${resultsDir}`);
