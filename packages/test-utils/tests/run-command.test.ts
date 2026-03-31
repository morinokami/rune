import { defineCommand } from "@rune-cli/core";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { runCommand } from "../src";

test("runCommand returns a successful command result", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string", required: true }],
    async run(ctx) {
      ctx.output.info(`hello ${ctx.options.name}`);
    },
  });

  const result = await runCommand(command, {
    options: { name: "rune" },
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello rune\n",
    stderr: "",
    data: undefined,
    errorMessage: undefined,
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
    stderr: "",
    errorMessage: "boom",
    data: undefined,
  });
});

test("runCommand injects cwd and rawArgs into the command context", async () => {
  const cwd = path.join("/tmp", "rune-test");
  const command = defineCommand({
    async run(ctx) {
      ctx.output.info(`${ctx.cwd} :: ${ctx.rawArgs.join(" ")}`);
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
    data: undefined,
    errorMessage: undefined,
  });
});

test("runCommand injects args into the command context", async () => {
  const command = defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    async run(ctx) {
      ctx.output.info(`id=${ctx.args.id}`);
    },
  });

  const result = await runCommand(command, {
    args: { id: "cmd_123" },
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "id=cmd_123\n",
    stderr: "",
    data: undefined,
    errorMessage: undefined,
  });
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

describe("json mode", () => {
  test("runCommand suppresses output.info when jsonMode is true", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.info("this should be suppressed");
        return { items: [1, 2, 3] };
      },
    });

    const result = await runCommand(command, { jsonMode: true });

    expect(result.stdout).toBe("");
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.exitCode).toBe(0);
  });

  test("runCommand preserves output.error in jsonMode", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.error("diagnostic warning");
        return { ok: true };
      },
    });

    const result = await runCommand(command, { jsonMode: true });

    expect(result.stderr).toBe("diagnostic warning\n");
    expect(result.data).toEqual({ ok: true });
  });

  test("runCommand returns data from json-enabled command without jsonMode", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.info("visible output");
        return { count: 42 };
      },
    });

    const result = await runCommand(command);

    expect(result.stdout).toBe("visible output\n");
    expect(result.data).toEqual({ count: 42 });
  });
});
