import { defineCommand } from "@rune-cli/core";
import { expectTypeOf, test } from "vite-plus/test";

import { runCommand, type CommandExecutionResult } from "../src";

test("runCommand accepts concrete command types", () => {
  const command = defineCommand({
    args: [{ name: "user-id", type: "string", required: true }],
    options: [
      { name: "display-name", type: "string", required: true },
      { name: "notify", type: "boolean", default: true },
      { name: "role", type: "string" },
    ],
    async run(ctx) {
      ctx.output.log(
        `${ctx.args.userId}:${ctx.options.displayName}:${ctx.options.notify}:${ctx.options.role ?? "viewer"}`,
      );
    },
  });

  const result = runCommand(command, ["u-100", "--display-name", "Ava"]);

  expectTypeOf(result).toEqualTypeOf<Promise<CommandExecutionResult>>();
});
