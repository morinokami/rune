import { expect, test } from "vite-plus/test";

import runePackageJson from "../package.json" with { type: "json" };
import { runRuneCli } from "../src/cli/rune-cli";

test("rune --version prints the version", async () => {
  const version = runePackageJson.version;
  const result = await runRuneCli({ argv: ["--version"] });

  expect(result).toEqual({
    exitCode: 0,
    stdout: `rune v${version}\n`,
    stderr: "",
  });
});

test("rune -V prints the version", async () => {
  const version = runePackageJson.version;
  const result = await runRuneCli({ argv: ["-V"] });

  expect(result).toEqual({
    exitCode: 0,
    stdout: `rune v${version}\n`,
    stderr: "",
  });
});

test("rune --help includes --version in options", async () => {
  const result = await runRuneCli({ argv: ["--help"] });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("--version");
});
