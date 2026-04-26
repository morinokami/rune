import { expectTypeOf, test } from "vite-plus/test";

import { defineCommand } from "../../src/core/define-command";
import { runCommand } from "../../src/test-utils/run-command";

test("runCommand accepts commands with options and args", async () => {
  const command = defineCommand({
    options: [
      { name: "display-name", type: "string", required: true },
      { name: "notify", type: "boolean", default: true },
      { name: "role", type: "string" },
    ],
    args: [{ name: "user-id", type: "string", required: true }],
    async run(ctx) {
      ctx.output.log(
        `${ctx.args.userId}:${ctx.options.displayName}:${ctx.options.notify}:${ctx.options.role ?? "viewer"}`,
      );
    },
  });

  const result = await runCommand(command, ["u-100", "--display-name", "Ava"]);

  expectTypeOf(result.data).toEqualTypeOf<undefined>();
});

test("runCommand infers result.data from json-enabled commands", async () => {
  const command = defineCommand({
    json: true,
    async run() {
      return { items: [1, 2, 3] };
    },
  });

  const result = await runCommand(command, ["--json"]);

  expectTypeOf(result.data).toEqualTypeOf<{ items: number[] } | undefined>();
});

test("runCommand exposes undefined data for non-json commands", async () => {
  const command = defineCommand({
    run({ output }) {
      output.log("ok");
    },
  });

  const result = await runCommand(command);

  expectTypeOf(result.data).toEqualTypeOf<undefined>();
});
