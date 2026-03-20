import path from "node:path";
import { expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
import { runCommand } from "../src/test";

test("runCommand returns a successful command result", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string", required: true }],
    async run(ctx) {
      console.log(`hello ${ctx.options.name}`);
    },
  });

  const result = await runCommand(command, {
    options: { name: "rune" },
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello rune\n",
    stderr: "",
  });
});

test("runCommand captures command failures without spawning a process", async () => {
  const command = defineCommand({
    async run() {
      throw new Error("boom");
    },
  });

  const result = await runCommand(command);

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "boom\n",
  });
});

test("runCommand injects cwd and rawArgs into the command context", async () => {
  const cwd = path.join("/tmp", "rune-test");
  const command = defineCommand({
    async run(ctx) {
      console.log(`${ctx.cwd} :: ${ctx.rawArgs.join(" ")}`);
    },
  });

  const result = await runCommand(command, {
    cwd,
    rawArgs: ["hello", "--name", "rune"],
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: `${cwd} :: hello --name rune\n`,
    stderr: "",
  });
});

test("runCommand injects args into the command context", async () => {
  const command = defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    async run(ctx) {
      console.log(`id=${ctx.args.id}`);
    },
  });

  const result = await runCommand(command, {
    args: { id: "cmd_123" },
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "id=cmd_123\n",
    stderr: "",
  });
});
