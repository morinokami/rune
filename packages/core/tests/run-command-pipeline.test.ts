import { describe, expect, test } from "vite-plus/test";

import { CommandError, defineCommand } from "../src";
import { runCommandPipeline } from "../src/run-command-pipeline";

describe("context and execution", () => {
  test("injects options, args, cwd, and rawArgs into the command context", async () => {
    const observed = {
      name: "",
      id: "",
      cwd: "",
      rawArgs: [] as readonly string[],
    };

    const command = defineCommand({
      args: [{ name: "id", type: "string", required: true }],
      options: [{ name: "name", type: "string", required: true }],
      async run(ctx) {
        observed.name = ctx.options.name;
        observed.id = ctx.args.id;
        observed.cwd = ctx.cwd;
        observed.rawArgs = ctx.rawArgs;
      },
    });

    const result = await runCommandPipeline({
      command,
      argv: ["my-id", "--name", "rune"],
      cwd: "/tmp/rune-project",
    });

    expect(observed).toEqual({
      name: "rune",
      id: "my-id",
      cwd: "/tmp/rune-project",
      rawArgs: ["my-id", "--name", "rune"],
    });
    expect(result).toEqual({
      parseOk: true,
      exitCode: 0,
      data: undefined,
      jsonMode: false,
    });
  });

  test("falls back to process.cwd() when cwd is omitted", async () => {
    let observedCwd = "";

    const command = defineCommand({
      run(ctx) {
        observedCwd = ctx.cwd;
      },
    });

    await runCommandPipeline({ command, argv: [] });

    expect(observedCwd).toBe(process.cwd());
  });

  test("defaults omitted boolean options to false", async () => {
    let forceValue: boolean | undefined;

    const command = defineCommand({
      options: [{ name: "force", type: "boolean" }],
      run(ctx) {
        forceValue = ctx.options.force;
      },
    });

    await runCommandPipeline({ command, argv: [] });

    expect(forceValue).toBe(false);
  });

  test("exposes camelCase aliases for kebab-case options and args", async () => {
    const observed = { opt: "", arg: "" };

    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }],
      options: [{ name: "dry-run", type: "boolean" }],
      run(ctx) {
        observed.opt = String(ctx.options.dryRun);
        observed.arg = ctx.args.myArg;
      },
    });

    await runCommandPipeline({
      command,
      argv: ["hello", "--dry-run"],
    });

    expect(observed).toEqual({ opt: "true", arg: "hello" });
  });

  test("exposes both casings for kebab-case inputs", async () => {
    const observed = { kebab: "", camel: "", optKebab: false, optCamel: false };

    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }],
      options: [{ name: "dry-run", type: "boolean" }],
      run(ctx) {
        observed.camel = ctx.args.myArg;
        observed.kebab = ctx.args["my-arg"];
        observed.optCamel = ctx.options.dryRun;
        observed.optKebab = ctx.options["dry-run"];
      },
    });

    await runCommandPipeline({
      command,
      argv: ["hello", "--dry-run"],
    });

    expect(observed).toEqual({ kebab: "hello", camel: "hello", optKebab: true, optCamel: true });
  });

  test("supports synchronous run functions", async () => {
    let called = false;

    const command = defineCommand({
      run() {
        called = true;
      },
    });

    const result = await runCommandPipeline({ command, argv: [] });

    expect(called).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});

describe("output and json mode", () => {
  function createCapturingSink() {
    const stdout: string[] = [];
    const stderr: string[] = [];

    return {
      stdout,
      stderr,
      sink: {
        stdout(message: string) {
          stdout.push(message);
        },
        stderr(message: string) {
          stderr.push(message);
        },
      },
    };
  }

  test("writes stdout and stderr through the provided sink", async () => {
    const { sink, stdout, stderr } = createCapturingSink();
    const command = defineCommand({
      run(ctx) {
        ctx.output.log("hello %s", "world");
        ctx.output.error("bad input");
      },
    });

    const result = await runCommandPipeline({
      command,
      argv: [],
      sink,
    });

    expect(result).toEqual({
      parseOk: true,
      exitCode: 0,
      data: undefined,
      jsonMode: false,
    });
    expect(stdout).toEqual(["hello world\n"]);
    expect(stderr).toEqual(["bad input\n"]);
  });

  test("returns command data and suppresses stdout in json mode", async () => {
    const { sink, stdout, stderr } = createCapturingSink();
    let observedRawArgs: readonly string[] = [];

    const command = defineCommand({
      json: true,
      run(ctx) {
        observedRawArgs = ctx.rawArgs;
        ctx.output.log("hidden");
        ctx.output.error("warning");
        return { ok: true };
      },
    });

    const result = await runCommandPipeline({
      command,
      argv: ["--json"],
      sink,
    });

    expect(observedRawArgs).toEqual(["--json"]);
    expect(result).toEqual({
      parseOk: true,
      exitCode: 0,
      data: { ok: true },
      jsonMode: true,
    });
    expect(stdout).toEqual([]);
    expect(stderr).toEqual(["warning\n"]);
  });

  test("does not treat --json after -- as a framework-managed flag", async () => {
    let observedArg = "";

    const command = defineCommand({
      json: true,
      args: [{ name: "value", type: "string", required: true }],
      run(ctx) {
        observedArg = ctx.args.value;
        return { value: ctx.args.value };
      },
    });

    const result = await runCommandPipeline({
      command,
      argv: ["--", "--json"],
    });

    expect(observedArg).toBe("--json");
    expect(result).toEqual({
      parseOk: true,
      exitCode: 0,
      data: { value: "--json" },
      jsonMode: false,
    });
  });

  test("treats --json as a user option when command json mode is disabled", async () => {
    let observedJson = false;

    const command = defineCommand({
      options: [{ name: "json", type: "boolean" }],
      run(ctx) {
        observedJson = ctx.options.json;
      },
    });

    const result = await runCommandPipeline({
      command,
      argv: ["--json"],
    });

    expect(observedJson).toBe(true);
    expect(result).toEqual({
      parseOk: true,
      exitCode: 0,
      data: undefined,
      jsonMode: false,
    });
  });
});

describe("parse failures", () => {
  test("returns invalid-arguments results when argument parsing fails", async () => {
    let called = false;

    const command = defineCommand({
      options: [{ name: "name", type: "string", required: true }],
      run() {
        called = true;
      },
    });

    const result = await runCommandPipeline({ command, argv: [] });

    expect(called).toBe(false);
    expect(result).toEqual({
      parseOk: false,
      exitCode: 1,
      error: {
        kind: "rune/invalid-arguments",
        message: "Missing required option:\n\n  --name <string>",
        exitCode: 1,
      },
      data: undefined,
      jsonMode: false,
    });
  });
});

describe("execution failures", () => {
  test.each([
    {
      label: "Error instances with messages",
      throwError: () => {
        throw new Error("Boom");
      },
      expectedMessage: "Boom",
    },
    {
      label: "Error instances with empty messages",
      throwError: () => {
        throw new Error("");
      },
      expectedMessage: "Error",
    },
    {
      label: "string throws",
      throwError: () => {
        throw "Boom";
      },
      expectedMessage: "Boom",
    },
    {
      label: "non-Error throws",
      throwError: () => {
        throw { code: "ENOPE" };
      },
      expectedMessage: "Unknown error",
    },
  ])(
    "normalizes unexpected execution failures from $label",
    async ({ throwError, expectedMessage }) => {
      const command = defineCommand({
        run() {
          throwError();
        },
      });

      const result = await runCommandPipeline({ command, argv: [] });

      expect(result).toEqual({
        parseOk: true,
        exitCode: 1,
        error: {
          kind: "rune/unexpected",
          message: expectedMessage,
          exitCode: 1,
        },
        data: undefined,
        jsonMode: false,
      });
    },
  );

  test("normalizes CommandError instances", async () => {
    const command = defineCommand({
      run() {
        throw new CommandError({
          kind: "project/invalid-name",
          message: "Project name must be lowercase kebab-case",
          hint: "Try --name my-app",
          details: { received: "MyApp" },
          exitCode: 9,
        });
      },
    });

    const result = await runCommandPipeline({ command, argv: [] });

    expect(result).toEqual({
      parseOk: true,
      exitCode: 9,
      error: {
        kind: "project/invalid-name",
        message: "Project name must be lowercase kebab-case",
        hint: "Try --name my-app",
        details: { received: "MyApp" },
        exitCode: 9,
      },
      data: undefined,
      jsonMode: false,
    });
  });

  test("normalizes plain structured error-like objects", async () => {
    const command = defineCommand({
      run() {
        throw {
          kind: "project/invalid-name",
          message: "Project name must be lowercase kebab-case",
          hint: "Try --name my-app",
          details: { received: "MyApp" },
          exitCode: 9,
        };
      },
    });

    const result = await runCommandPipeline({ command, argv: [] });

    expect(result).toEqual({
      parseOk: true,
      exitCode: 9,
      error: {
        kind: "project/invalid-name",
        message: "Project name must be lowercase kebab-case",
        hint: "Try --name my-app",
        details: { received: "MyApp" },
        exitCode: 9,
      },
      data: undefined,
      jsonMode: false,
    });
  });

  test("normalizes invalid CommandError exit codes to 1", async () => {
    const command = defineCommand({
      run() {
        throw new CommandError({
          kind: "project/invalid-name",
          message: "bad",
          exitCode: 0,
        });
      },
    });

    const result = await runCommandPipeline({ command, argv: [] });

    expect(result).toEqual({
      parseOk: true,
      exitCode: 1,
      error: {
        kind: "project/invalid-name",
        message: "bad",
        exitCode: 1,
      },
      data: undefined,
      jsonMode: false,
    });
  });
});
