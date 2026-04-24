import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { CommandError } from "../../src/core/command-error";
import { defineCommand } from "../../src/core/define-command";
import { runCommand } from "../../src/test-utils/run-command";

describe("execution", () => {
  test("runCommand returns a successful command result", async () => {
    const command = defineCommand({
      options: [{ name: "name", type: "string", required: true }],
      async run(ctx) {
        ctx.output.log(`hello ${ctx.options.name}`);
      },
    });

    const result = await runCommand(command, ["--name", "rune"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
      data: undefined,
      error: undefined,
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
      error: {
        kind: "rune/unexpected",
        message: "boom",
        exitCode: 1,
      },
      data: undefined,
    });
  });

  test("runCommand appends human error after runtime stderr in non-json mode", async () => {
    const command = defineCommand({
      async run(ctx) {
        ctx.output.error("diagnostic: loading config\n");
        throw new CommandError({
          kind: "config/not-found",
          message: "Config file was not found",
          hint: "Create rune.config.ts",
        });
      },
    });

    const result = await runCommand(command);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "diagnostic: loading config\n\nConfig file was not found\nHint: Create rune.config.ts\n",
    );
  });

  test("runCommand returns structured command failures", async () => {
    const command = defineCommand({
      async run() {
        throw new CommandError({
          kind: "config/not-found",
          message: "Config file was not found",
          hint: "Create rune.config.ts",
          exitCode: 7,
        });
      },
    });

    const result = await runCommand(command);

    expect(result).toEqual({
      exitCode: 7,
      stdout: "",
      stderr: "Config file was not found\nHint: Create rune.config.ts\n",
      error: {
        kind: "config/not-found",
        message: "Config file was not found",
        hint: "Create rune.config.ts",
        exitCode: 7,
      },
      data: undefined,
    });
  });

  test("runCommand injects cwd into the command context", async () => {
    const cwd = path.join("/tmp", "rune-test");
    const command = defineCommand({
      async run(ctx) {
        ctx.output.log(ctx.cwd);
      },
    });

    const result = await runCommand(command, [], { cwd });

    expect(result.stdout).toBe(`${cwd}\n`);
  });

  test("runCommand passes original argv as rawArgs", async () => {
    const command = defineCommand({
      options: [{ name: "name", type: "string", required: true }],
      async run(ctx) {
        ctx.output.log(ctx.rawArgs.join(" "));
      },
    });

    const result = await runCommand(command, ["--name", "rune"]);

    expect(result.stdout).toBe("--name rune\n");
  });
});

describe("validation", () => {
  test("runCommand parses positional args from argv", async () => {
    const command = defineCommand({
      args: [{ name: "id", type: "string", required: true }],
      async run(ctx) {
        ctx.output.log(`id=${ctx.args.id}`);
      },
    });

    const result = await runCommand(command, ["cmd_123"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("id=cmd_123\n");
  });

  test("runCommand returns an error for missing required args", async () => {
    const command = defineCommand({
      args: [{ name: "id", type: "string", required: true }],
      async run(ctx) {
        ctx.output.log(ctx.args.id);
      },
    });

    const result = await runCommand(command, []);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toBe("");
    expect(result.error).toEqual({
      kind: "rune/invalid-arguments",
      message: "Missing required argument:\n\n  id",
      exitCode: 1,
    });
  });

  test("runCommand returns an error for unknown options", async () => {
    const command = defineCommand({
      async run() {},
    });

    const result = await runCommand(command, ["--unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toBe("");
    expect(result.error).toEqual({
      kind: "rune/invalid-arguments",
      message: 'Unknown option "--unknown"',
      exitCode: 1,
    });
  });

  test("runCommand applies default values", async () => {
    const command = defineCommand({
      options: [{ name: "count", type: "number", default: 1 }],
      async run(ctx) {
        ctx.output.log(`count=${ctx.options.count}`);
      },
    });

    const result = await runCommand(command, []);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("count=1\n");
  });

  test("runCommand coerces string argv to number", async () => {
    const command = defineCommand({
      options: [{ name: "count", type: "number", required: true }],
      async run(ctx) {
        ctx.output.log(`type=${typeof ctx.options.count},value=${ctx.options.count}`);
      },
    });

    const result = await runCommand(command, ["--count", "5"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("type=number,value=5\n");
  });
});

describe("json mode", () => {
  test("runCommand suppresses output.log when --json is passed", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.log("this should be suppressed");
        return { items: [1, 2, 3] };
      },
    });

    const result = await runCommand(command, ["--json"]);

    expect(result.stdout).toBe("");
    expect(result.data).toEqual({ items: [1, 2, 3] });
    expect(result.exitCode).toBe(0);
  });

  test("runCommand preserves output.error in json mode", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.error("diagnostic warning");
        return { ok: true };
      },
    });

    const result = await runCommand(command, ["--json"]);

    expect(result.stderr).toBe("diagnostic warning\n");
    expect(result.data).toEqual({ ok: true });
  });

  test("runCommand returns data from json-enabled command without --json flag", async () => {
    const command = defineCommand({
      json: true,
      async run(ctx) {
        ctx.output.log("visible output");
        return { count: 42 };
      },
    });

    const result = await runCommand(command);

    expect(result.stdout).toBe("visible output\n");
    expect(result.data).toEqual({ count: 42 });
  });

  test("runCommand preserves original argv as rawArgs even when --json is extracted", async () => {
    const command = defineCommand({
      json: true,
      options: [{ name: "name", type: "string", required: true }],
      async run(ctx) {
        return { rawArgs: [...ctx.rawArgs] };
      },
    });

    const result = await runCommand(command, ["--json", "--name", "rune"]);

    expect(result.data).toEqual({ rawArgs: ["--json", "--name", "rune"] });
  });

  test("runCommand does not write human error to stderr in json mode for CommandError", async () => {
    const command = defineCommand({
      json: true,
      async run() {
        throw new CommandError({
          kind: "not-found",
          message: "Resource not found",
          hint: "Check the ID",
        });
      },
    });

    const result = await runCommand(command, ["--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.error).toEqual({
      kind: "not-found",
      message: "Resource not found",
      hint: "Check the ID",
      exitCode: 1,
    });
  });

  test("runCommand does not write human error to stderr in json mode for parse failure", async () => {
    const command = defineCommand({
      json: true,
      args: [{ name: "id", type: "string", required: true }],
      async run() {
        return { ok: true };
      },
    });

    const result = await runCommand(command, ["--json"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.error).toEqual({
      kind: "rune/invalid-arguments",
      message: "Missing required argument:\n\n  id",
      exitCode: 1,
    });
  });

  test("runCommand does not extract --json after -- terminator", async () => {
    const command = defineCommand({
      json: true,
      args: [{ name: "flag", type: "string", required: true }],
      async run(ctx) {
        ctx.output.log(ctx.args.flag);
        return { extracted: false };
      },
    });

    const result = await runCommand(command, ["--", "--json"]);

    expect(result.stdout).toBe("--json\n");
    expect(result.data).toEqual({ extracted: false });
  });
});
