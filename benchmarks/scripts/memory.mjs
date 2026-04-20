#!/usr/bin/env node
// Measure peak RSS for each (fixture, scenario) pair via /usr/bin/time.
// macOS: `/usr/bin/time -l`  (maximum resident set size, bytes)
// Linux: `/usr/bin/time -v`  (Maximum resident set size (kbytes))
//
// Build fixtures first with `bench.mjs` (or run `vp run --filter
// './benchmarks/fixtures/*' build` manually); this script only measures.
import { spawnSync } from "node:child_process";
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

const WARMUP = 2;
const RUNS = 10;

const platform = process.platform;
if (platform !== "darwin" && platform !== "linux") {
  console.error(`unsupported platform: ${platform}`);
  process.exit(1);
}
const timeFlag = platform === "darwin" ? "-l" : "-v";

function measureOnce(entry, args) {
  const r = spawnSync("/usr/bin/time", [timeFlag, "node", entry, ...args], {
    stdio: ["ignore", "ignore", "pipe"],
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`command failed: node ${entry} ${args.join(" ")}\n${r.stderr}`);
  }
  return parseRss(r.stderr);
}

function parseRss(stderr) {
  if (platform === "darwin") {
    // "            49430528  maximum resident set size"
    const m = stderr.match(/(\d+)\s+maximum resident set size/);
    if (!m) throw new Error(`no RSS line in:\n${stderr}`);
    return Number(m[1]); // bytes
  }
  // Linux GNU time: "Maximum resident set size (kbytes): 40124"
  const m = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  if (!m) throw new Error(`no RSS line in:\n${stderr}`);
  return Number(m[1]) * 1024; // to bytes
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const results = { platform, stamp: new Date().toISOString(), runs: [] };

for (const s of scenarios) {
  console.log(`\n=== scenario: ${s.id} ===`);
  for (const f of fixtures) {
    const entry = resolve(f.dir, "dist/cli.mjs");
    if (!existsSync(entry)) {
      throw new Error(`missing build artifact: ${entry} (run bench.mjs first)`);
    }
    for (let i = 0; i < WARMUP; i++) measureOnce(entry, s.args);
    const samples = [];
    for (let i = 0; i < RUNS; i++) samples.push(measureOnce(entry, s.args));
    const med = median(samples);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    results.runs.push({
      scenario: s.id,
      fixture: f.name,
      peakRssBytesMedian: med,
      peakRssBytesMin: min,
      peakRssBytesMax: max,
      samples: RUNS,
    });
    const mb = (b) => (b / 1024 / 1024).toFixed(1);
    console.log(
      `  ${f.name.padEnd(10)} ${mb(med).padStart(6)} MB  (min ${mb(min)}, max ${mb(max)})`,
    );
  }
}

const resultsDir = resolve(root, "results");
mkdirSync(resultsDir, { recursive: true });
const stamp = results.stamp.replace(/[:.]/g, "-");
const out = resolve(resultsDir, `${stamp}-memory.json`);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nResults written to ${out}`);
