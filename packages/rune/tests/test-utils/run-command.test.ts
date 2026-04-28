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
      data: undefined,
      error: undefined,
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
      data: undefined,
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
      data: undefined,
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
});
