import { captureProcessOutput } from "@rune-cli/core";
import { expect, test } from "vite-plus/test";

import runePackageJson from "../package.json" with { type: "json" };
import { runRuneCli } from "../src/cli/rune-cli";

test("rune --version prints the version", async () => {
  const version = runePackageJson.version;
  const captured = await captureProcessOutput(() => runRuneCli({ argv: ["--version"] }));

  expect(captured.value).toBe(0);
  expect(captured.stdout).toBe(`rune v${version}\n`);
  expect(captured.stderr).toBe("");
});

test("rune -V prints the version", async () => {
  const version = runePackageJson.version;
  const captured = await captureProcessOutput(() => runRuneCli({ argv: ["-V"] }));

  expect(captured.value).toBe(0);
  expect(captured.stdout).toBe(`rune v${version}\n`);
  expect(captured.stderr).toBe("");
});

test("rune --help includes --version in options", async () => {
  const captured = await captureProcessOutput(() => runRuneCli({ argv: ["--help"] }));

  expect(captured.value).toBe(0);
  expect(captured.stdout).toContain("--version");
  expect(captured.stderr).toBe("");
});
