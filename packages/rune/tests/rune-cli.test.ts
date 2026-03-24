import { expect, test } from "vite-plus/test";

import runePackageJson from "../package.json" with { type: "json" };
import { runRuneCli } from "../src/cli/rune-cli";
import { captureExitCode } from "./helpers";

async function captureRuneCli(argv: readonly string[]) {
  return captureExitCode(() => runRuneCli({ argv }));
}

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

test("rune --help includes --version in options", async () => {
  const captured = await captureRuneCli(["--help"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("--version");
  expect(captured.stderr).toBe("");
});
