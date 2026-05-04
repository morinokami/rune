import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { CommandError } from "../../src/core/command-error";
import { defineCommand } from "../../src/core/define-command";
import { defineConfig } from "../../src/core/define-config";
import { runCommand } from "../../src/test-utils/run-command";
import { createRunCommand } from "../../src/test-utils/run-command";

// These tests cover the helper-specific contract of runCommand:
//   - in-process capture of stdout/stderr and exitCode
//   - human error rendering into stderr for non-json mode
//   - human error suppression in json mode
// End-to-end command semantics (argv parsing, defaults, coercion, json mode,
// rawArgs, cwd, sink forwarding) are covered by parse-command-args and
// run-command-pipeline tests.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("execution capture", () => {
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
      error: undefined,
      output: { kind: "text" },
    });
  });

  test("createRunCommand injects global options for command tests", async () => {
    const config = defineConfig({
      options: [{ name: "profile", type: "string", default: "prod" }],
    });
    const runCommand = createRunCommand(config);
    const command = defineCommand({
      async run(ctx) {
        const options = ctx.options as { readonly profile: string };
        ctx.output.log(`profile=${options.profile}`);
      },
    });

    const defaultResult = await runCommand(command);
    const providedResult = await runCommand(command, ["--profile", "dev"]);

    expect(defaultResult.stdout).toBe("profile=prod\n");
    expect(providedResult.stdout).toBe("profile=dev\n");
  });

  test("runCommand injects env as a complete replacement for option env fallbacks", async () => {
    vi.stubEnv("RUNE_RUN_COMMAND_PROFILE", "host");

    const command = defineCommand({
      options: [{ name: "profile", type: "string", env: "RUNE_RUN_COMMAND_PROFILE" }],
      async run(ctx) {
        ctx.output.log(`profile=${ctx.options.profile ?? "unset"}`);
      },
    });

    const defaultResult = await runCommand(command);
    const injectedResult = await runCommand(command, [], {
      env: { RUNE_RUN_COMMAND_PROFILE: "test" },
    });

    expect(defaultResult.stdout).toBe("profile=unset\n");
    expect(injectedResult.stdout).toBe("profile=test\n");
  });

  test("createRunCommand supports env fallback for global options", async () => {
    const config = defineConfig({
      options: [{ name: "profile", type: "string", env: "RUNE_PROFILE", default: "prod" }],
    });
    const runCommand = createRunCommand(config);
    const command = defineCommand({
      async run(ctx) {
        const options = ctx.options as { readonly profile: string };
        ctx.output.log(`profile=${options.profile}`);
      },
    });

    const result = await runCommand(command, [], { env: { RUNE_PROFILE: "dev" } });

    expect(result.stdout).toBe("profile=dev\n");
  });

  test("runCommand injects string stdin into ctx.stdin", async () => {
    const command = defineCommand({
      async run(ctx) {
        ctx.output.log(
          JSON.stringify({
            text: await ctx.stdin.text(),
            isTTY: ctx.stdin.isTTY,
            isPiped: ctx.stdin.isPiped,
          }),
        );
      },
    });

    const result = await runCommand(command, [], { stdin: "hello\n" });

    expect(result.stdout).toBe('{"text":"hello\\n","isTTY":false,"isPiped":true}\n');
  });

  test("runCommand injects byte stdin into ctx.stdin", async () => {
    const command = defineCommand({
      async run(ctx) {
        ctx.output.log(Array.from(await ctx.stdin.bytes()).join(","));
      },
    });

    const result = await runCommand(command, [], {
      stdin: Buffer.from([0, 1, 255]),
    });

    expect(result.stdout).toBe("0,1,255\n");
  });

  test("runCommand uses isolated empty stdin when stdin is omitted", async () => {
    const command = defineCommand({
      async run(ctx) {
        ctx.output.log(
          JSON.stringify({
            text: await ctx.stdin.text(),
            isTTY: ctx.stdin.isTTY,
            isPiped: ctx.stdin.isPiped,
          }),
        );
      },
    });

    const result = await runCommand(command);

    expect(result.stdout).toBe('{"text":"","isTTY":true,"isPiped":false}\n');
  });

  test("createRunCommand preserves stdin injection", async () => {
    const config = defineConfig({
      options: [{ name: "profile", type: "string", default: "prod" }],
    });
    const runCommand = createRunCommand(config);
    const command = defineCommand({
      async run(ctx) {
        const options = ctx.options as { readonly profile: string };
        ctx.output.log(`${options.profile}:${await ctx.stdin.text()}`);
      },
    });

    const result = await runCommand(command, [], { stdin: "payload" });

    expect(result.stdout).toBe("prod:payload\n");
  });

  test("runCommand captures unexpected errors without spawning a process", async () => {
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
      output: { kind: "text" },
    });
  });

  test("runCommand returns structured CommandError failures with custom exit code", async () => {
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
      output: { kind: "text" },
    });
  });

  test("runCommand captures JSON documents under output", async () => {
    const command = defineCommand({
      json: true,
      run(ctx) {
        ctx.output.log("hidden");
        return { items: [1, 2, 3] };
      },
    });

    const result = await runCommand(command, ["--json"]);

    expect(result).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
      error: undefined,
      output: { kind: "json", document: { items: [1, 2, 3] } },
    });
  });

  test("runCommand captures JSON Lines stdout and records", async () => {
    const command = defineCommand({
      jsonl: true,
      async *run(ctx) {
        ctx.output.log("hidden");
        ctx.output.error("diagnostic");
        yield { id: "a" };
        yield { id: "b" };
      },
    });

    const result = await runCommand(command);

    expect(result).toEqual({
      exitCode: 0,
      stdout: '{"id":"a"}\n{"id":"b"}\n',
      stderr: "diagnostic\n",
      error: undefined,
      output: { kind: "jsonl", records: [{ id: "a" }, { id: "b" }] },
    });
  });
});

describe("human error rendering", () => {
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
      message: "Missing required argument:\n  id",
      exitCode: 1,
    });
  });

  test("runCommand writes JSON error envelopes to stderr for JSON Lines failures", async () => {
    const command = defineCommand({
      jsonl: true,
      async *run(ctx) {
        ctx.output.error("diagnostic");
        yield { id: "a" };
        throw new CommandError({
          kind: "stream/aborted",
          message: "Lost connection",
          hint: "Retry later",
        });
      },
    });

    const result = await runCommand(command);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('{"id":"a"}\n');
    expect(result.stderr).toBe(
      'diagnostic\n{"error":{"kind":"stream/aborted","message":"Lost connection","hint":"Retry later"}}\n',
    );
    expect(result.output.records).toEqual([{ id: "a" }]);
  });
});
