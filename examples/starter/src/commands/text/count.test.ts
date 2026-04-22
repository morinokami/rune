import { runCommand } from "@rune-cli/rune/test";
import { expect, test } from "vitest";

import countCommand from "./count";

test("counts words by default", async () => {
  const result = await runCommand(countCommand, ["hello rune world"]);

  expect(result.stdout).toEqual("3\n");
});

test("counts characters with --unit chars", async () => {
  const result = await runCommand(countCommand, ["hello", "--unit", "chars"]);

  expect(result.stdout).toEqual("5\n");
});
