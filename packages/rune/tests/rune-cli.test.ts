import { expect, test } from "vite-plus/test";

import runePackageJson from "../package.json" with { type: "json" };
import { runRuneCli } from "../src/cli/rune-cli";
import { captureExitCode } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function captureRuneCli(argv: readonly string[]) {
  return captureExitCode(() => runRuneCli({ argv }));
}

// ---------------------------------------------------------------------------
// Version output
// ---------------------------------------------------------------------------

test("rune --version prints the version", async () => {
  const version = runePackageJson.version;
  const captured = await captureRuneCli(["--version"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe(`rune v${version}\n`);
  expect(captured.stderr).toBe("");
});

test("rune -V prints the version", async () => {
  const version = runePackageJson.version;
  const captured = await captureRuneCli(["-V"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe(`rune v${version}\n`);
  expect(captured.stderr).toBe("");
});

// ---------------------------------------------------------------------------
// Help output
// ---------------------------------------------------------------------------

test("rune -h prints the top-level help output", async () => {
  const captured = await captureRuneCli(["-h"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: rune <command>\n");
  expect(captured.stderr).toBe("");
});

test("rune --help includes --version in options", async () => {
  const captured = await captureRuneCli(["--help"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("--version");
  expect(captured.stderr).toBe("");
});
