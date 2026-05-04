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

  expectTypeOf(result.output).toEqualTypeOf<{ readonly kind: "text" }>();
});

test("runCommand infers result.output.document from json-enabled commands", async () => {
  const command = defineCommand({
    json: true,
    async run() {
      return { items: [1, 2, 3] };
    },
  });

  const result = await runCommand(command, ["--json"]);

  expectTypeOf(result.output).toEqualTypeOf<{
    readonly kind: "json";
    readonly document: { items: number[] } | undefined;
  }>();
});

test("runCommand infers result.output.records from jsonl-enabled commands", async () => {
  const command = defineCommand({
    jsonl: true,
    async *run() {
      yield { id: "a", status: "ready" as const };
    },
  });

  const result = await runCommand(command);

  expectTypeOf(result.output).toEqualTypeOf<{
    readonly kind: "jsonl";
    readonly records: { id: string; status: "ready" }[];
  }>();
});

test("runCommand exposes text output for non-json commands", async () => {
  const command = defineCommand({
    run({ output }) {
      output.log("ok");
    },
  });

  const result = await runCommand(command);

  expectTypeOf(result.output).toEqualTypeOf<{ readonly kind: "text" }>();
});

test("runCommand accepts stdin context and exposes ctx.stdin", async () => {
  const command = defineCommand({
    async run(ctx) {
      expectTypeOf(ctx.stdin.isTTY).toEqualTypeOf<boolean>();
      expectTypeOf(ctx.stdin.isPiped).toEqualTypeOf<boolean>();
      expectTypeOf(await ctx.stdin.text()).toEqualTypeOf<string>();
      expectTypeOf(await ctx.stdin.bytes()).toEqualTypeOf<Uint8Array>();
    },
  });

  await runCommand(command, [], { stdin: "hello" });
  await runCommand(command, [], { stdin: Buffer.from("hello") });
  await runCommand(command, [], { stdin: new Uint8Array([1, 2, 3]) });
});
