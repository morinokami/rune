import { describe, expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
import { runParsedCommand } from "../src/run-parsed-command";

describe("context injection and defaults", () => {
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

    const result = await runParsedCommand({
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
    expect(result.exitCode).toBe(0);
  });

  test("falls back to process.cwd() when cwd is omitted", async () => {
    let observedCwd = "";

    const command = defineCommand({
      run(ctx) {
        observedCwd = ctx.cwd;
      },
    });

    await runParsedCommand({ command, argv: [] });

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

    await runParsedCommand({ command, argv: [] });

    expect(forceValue).toBe(false);
  });

  test("exposes camelCase aliases for kebab-case options and args", async () => {
    const observed = { opt: "", arg: "" };

    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }] as const,
      options: [{ name: "dry-run", type: "boolean" }] as const,
      run(ctx) {
        observed.opt = String(ctx.options.dryRun);
        observed.arg = ctx.args.myArg;
      },
    });

    await runParsedCommand({
      command,
      argv: ["hello", "--dry-run"],
    });

    expect(observed).toEqual({ opt: "true", arg: "hello" });
  });

  test("accepts camelCase input via argv and exposes both casings", async () => {
    const observed = { kebab: "", camel: "", optKebab: false, optCamel: false };

    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }] as const,
      options: [{ name: "dry-run", type: "boolean" }] as const,
      run(ctx) {
        observed.camel = ctx.args.myArg;
        observed.kebab = ctx.args["my-arg"];
        observed.optCamel = ctx.options.dryRun;
        observed.optKebab = ctx.options["dry-run"];
      },
    });

    await runParsedCommand({
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

    await runParsedCommand({ command, argv: [] });

    expect(called).toBe(true);
  });
});

describe("error handling", () => {
  test("returns a non-zero result when a command throws", async () => {
    let called = false;

    const command = defineCommand({
      async run() {
        called = true;
        throw new Error("Boom");
      },
    });

    const result = await runParsedCommand({ command, argv: [] });

    expect(called).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBe("Boom");
  });

  test("preserves an empty Error message", async () => {
    const command = defineCommand({
      run() {
        throw new Error("");
      },
    });

    const result = await runParsedCommand({ command, argv: [] });

    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBeUndefined();
  });

  test("normalizes non-Error throws", async () => {
    const command = defineCommand({
      run() {
        throw { code: "ENOPE" };
      },
    });

    const result = await runParsedCommand({ command, argv: [] });

    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toBe("Unknown error");
  });
});
