import { describe, expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
import { executeCommand } from "../src/execute-command";

describe("context injection and defaults", () => {
  test("executeCommand runs a command with injected context", async () => {
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

    const result = await executeCommand(command, {
      options: { name: "rune" },
      args: { id: "42" },
      cwd: "/tmp/rune-project",
      rawArgs: ["project", "42", "--name", "rune"],
    });

    expect(observed).toEqual({
      name: "rune",
      id: "42",
      cwd: "/tmp/rune-project",
      rawArgs: ["project", "42", "--name", "rune"],
    });
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand falls back to process defaults", async () => {
    const observed = {
      cwd: "",
      rawArgs: [] as readonly string[],
    };

    const command = defineCommand({
      run(ctx) {
        observed.cwd = ctx.cwd;
        observed.rawArgs = ctx.rawArgs;
      },
    });

    const result = await executeCommand(command);

    expect(observed).toEqual({
      cwd: process.cwd(),
      rawArgs: [],
    });
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand defaults omitted boolean options to false", async () => {
    let forceValue: boolean | undefined;

    const command = defineCommand({
      options: [{ name: "force", type: "boolean" }],
      run(ctx) {
        forceValue = ctx.options.force;
      },
    });

    const result = await executeCommand(command, { options: {} });

    expect(forceValue).toBe(false);
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand accepts omitted required and default-backed fields", async () => {
    let called = false;

    const command = defineCommand({
      options: [
        { name: "name", type: "string", required: true },
        { name: "count", type: "number", default: 1 },
      ],
      run() {
        called = true;
      },
    });

    const result = await executeCommand(command, { options: {} });

    expect(called).toBe(true);
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand exposes camelCase aliases for kebab-case options and args", async () => {
    const observed = { opt: "", arg: "" };

    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }] as const,
      options: [{ name: "dry-run", type: "boolean" }] as const,
      run(ctx) {
        observed.opt = String(ctx.options.dryRun);
        observed.arg = ctx.args.myArg;
      },
    });

    const result = await executeCommand(command, {
      options: { "dry-run": true },
      args: { "my-arg": "hello" },
    });

    expect(observed).toEqual({ opt: "true", arg: "hello" });
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand accepts camelCase input and exposes both casings", async () => {
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

    const result = await executeCommand(command, {
      options: { dryRun: true },
      args: { myArg: "hello" },
    });

    expect(observed).toEqual({ kebab: "hello", camel: "hello", optKebab: true, optCamel: true });
    expect(result).toEqual({ exitCode: 0 });
  });

  test("executeCommand supports synchronous run functions", async () => {
    let called = false;

    const command = defineCommand({
      run() {
        called = true;
      },
    });

    const result = await executeCommand(command);

    expect(called).toBe(true);
    expect(result).toEqual({ exitCode: 0 });
  });
});

describe("error handling", () => {
  test("executeCommand returns a non-zero result when a command throws", async () => {
    let called = false;

    const command = defineCommand({
      async run() {
        called = true;
        throw new Error("Boom");
      },
    });

    const result = await executeCommand(command);

    expect(called).toBe(true);
    expect(result).toEqual({ exitCode: 1, errorMessage: "Boom" });
  });

  test("executeCommand preserves an empty Error message", async () => {
    const command = defineCommand({
      run() {
        throw new Error("");
      },
    });

    const result = await executeCommand(command);

    expect(result).toEqual({ exitCode: 1 });
  });

  test("executeCommand normalizes non-Error throws", async () => {
    const command = defineCommand({
      run() {
        throw { code: "ENOPE" };
      },
    });

    const result = await executeCommand(command);

    expect(result).toEqual({ exitCode: 1, errorMessage: "Unknown error" });
  });
});
