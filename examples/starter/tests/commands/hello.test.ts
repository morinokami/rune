import { runCommand } from "@rune-cli/rune/test";
import { expect, test } from "vitest";

import helloCommand from "../../src/commands/hello";

test("hello command prints a greeting", async () => {
  const result = await runCommand(helloCommand);

  expect(result.stdout).toEqual("hello from my-cli\n");
});
