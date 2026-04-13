import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import type { DefinedCommand } from "../src/command-types";

import { defineCommand } from "../src";
import { parseCommandArgs } from "../src/parse-command-args";

describe("primitive parsing and defaults", () => {
  test("parseCommandArgs parses args, options, short names, booleans, and defaults", async () => {
    const command = defineCommand({
      args: [{ name: "id", type: "string", required: true }],
      options: [
        { name: "name", type: "string", required: true },
        { name: "force", type: "boolean", short: "f" },
        { name: "count", type: "number", default: 1 },
      ],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["123", "--name", "rune", "-f"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { id: "123" },
        options: {
          name: "rune",
          force: true,
          count: 1,
        },
        rawArgs: ["123", "--name", "rune", "-f"],
      },
    });
  });

  test("parseCommandArgs supports --name=value syntax", async () => {
    const command = defineCommand({
      options: [{ name: "name", type: "string", required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--name=rune"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { name: "rune" },
        rawArgs: ["--name=rune"],
      },
    });
  });

  test("parseCommandArgs parses primitive boolean args", async () => {
    const command = defineCommand({
      args: [{ name: "enabled", type: "boolean", required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["true"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { enabled: true },
        options: {},
        rawArgs: ["true"],
      },
    });
  });

  test("parseCommandArgs rejects invalid primitive boolean args", async () => {
    const command = defineCommand({
      args: [{ name: "enabled", type: "boolean", required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["yes"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Invalid value for argument enabled:\n\n  Expected boolean, received "yes"',
      },
    });
  });

  test("parseCommandArgs applies default option values", async () => {
    const command = defineCommand({
      options: [{ name: "count", type: "number", default: 1 }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { count: 1 },
        rawArgs: [],
      },
    });
  });

  test("parseCommandArgs applies default argument values", async () => {
    const command = defineCommand({
      args: [{ name: "mode", type: "string", default: "dev" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { mode: "dev" },
        options: {},
        rawArgs: [],
      },
    });
  });

  test("parseCommandArgs omits optional primitive args that are not provided", async () => {
    const command = defineCommand({
      args: [{ name: "target", type: "string" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: {},
        rawArgs: [],
      },
    });
  });

  test("parseCommandArgs defaults omitted boolean options to false", async () => {
    const command = defineCommand({
      options: [{ name: "force", type: "boolean" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { force: false },
        rawArgs: [],
      },
    });
  });

  test("parseCommandArgs succeeds for commands without fields", async () => {
    const command = defineCommand({
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: {},
        rawArgs: [],
      },
    });
  });
});

describe("schema-backed fields", () => {
  test("parseCommandArgs parses a schema-backed arg", async () => {
    const command = defineCommand({
      args: [{ name: "id", schema: z.uuid() }],
      async run() {},
    });

    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = await parseCommandArgs(command, [id]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { id },
        options: {},
        rawArgs: [id],
      },
    });
  });

  test("parseCommandArgs parses a schema-backed option", async () => {
    const command = defineCommand({
      options: [{ name: "port", schema: z.coerce.number().int().positive() }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--port", "3000"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { port: 3000 },
        rawArgs: ["--port", "3000"],
      },
    });
  });

  test("parseCommandArgs parses schema-backed flag options", async () => {
    const command = defineCommand({
      options: [{ name: "force", schema: z.boolean(), flag: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--force"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { force: true },
        rawArgs: ["--force"],
      },
    });
  });

  test("parseCommandArgs omits schema-backed options when validating undefined succeeds", async () => {
    const command = defineCommand({
      options: [{ name: "mode", schema: z.string().optional() }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: {},
        rawArgs: [],
      },
    });
  });

  test("parseCommandArgs applies schema-backed defaults for omitted args", async () => {
    const command = defineCommand({
      args: [{ name: "mode", schema: z.string().default("dev") }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { mode: "dev" },
        options: {},
        rawArgs: [],
      },
    });
  });
});

describe("missing required fields", () => {
  test.each([
    {
      label: "a required argument",
      define: () =>
        defineCommand({
          args: [{ name: "id", type: "string", required: true }],
          async run() {},
        }),
      message: "Missing required argument:\n\n  id",
    },
    {
      label: "a required option",
      define: () =>
        defineCommand({
          options: [{ name: "name", type: "string", required: true }],
          async run() {},
        }),
      message: "Missing required option:\n\n  --name <string>",
    },
    {
      label: "a required boolean option",
      define: () =>
        defineCommand({
          options: [{ name: "force", type: "boolean", required: true }],
          async run() {},
        }),
      message: "Missing required option:\n\n  --force",
    },
    {
      label: "a required schema-backed argument",
      define: () =>
        defineCommand({
          args: [{ name: "token", schema: z.string() }],
          async run() {},
        }),
      message: "Missing required argument:\n\n  token",
    },
    {
      label: "a required schema-backed option",
      define: () =>
        defineCommand({
          options: [{ name: "token", schema: z.string() }],
          async run() {},
        }),
      message: "Missing required option:\n\n  --token",
    },
  ])("parseCommandArgs fails when $label is missing", async ({ define, message }) => {
    const result = await parseCommandArgs(define() as unknown as DefinedCommand, []);

    expect(result).toEqual({
      ok: false,
      error: {
        message,
      },
    });
  });
});

describe("invalid values", () => {
  test.each([
    {
      label: "an invalid number option",
      define: () =>
        defineCommand({
          options: [{ name: "count", type: "number", required: true }],
          async run() {},
        }),
      argv: ["--count", "abc"],
      message: 'Invalid value for option --count <number>:\n\n  Expected number, received "abc"',
    },
    {
      label: "an invalid number argument",
      define: () =>
        defineCommand({
          args: [{ name: "count", type: "number", required: true }],
          async run() {},
        }),
      argv: ["oops"],
      message: 'Invalid value for argument count:\n\n  Expected number, received "oops"',
    },
  ])("parseCommandArgs fails for $label", async ({ define, argv, message }) => {
    const result = await parseCommandArgs(define() as unknown as DefinedCommand, argv);

    expect(result).toEqual({
      ok: false,
      error: {
        message,
      },
    });
  });

  test("parseCommandArgs fails when a schema-backed arg is invalid", async () => {
    const command = defineCommand({
      args: [{ name: "id", schema: z.uuid() }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["bad"]);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected parseCommandArgs to fail");
    }
    expect(result.error.message).toContain("Invalid value for argument id");
  });

  test("parseCommandArgs fails when a schema-backed option is invalid", async () => {
    const command = defineCommand({
      options: [{ name: "port", schema: z.coerce.number().int().positive() }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--port", "bad"]);

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected parseCommandArgs to fail");
    }
    expect(result.error.message).toContain("Invalid value for option --port");
  });
});

describe("negatable boolean options", () => {
  function createNegatableColorCommand() {
    return defineCommand({
      options: [{ name: "color", type: "boolean", default: true }],
      async run() {},
    });
  }

  test.each([
    {
      label: "uses default true when omitted",
      argv: [] as string[],
      options: { color: true },
      rawArgs: [] as string[],
    },
    {
      label: "sets the value to true when --flag is provided",
      argv: ["--color"],
      options: { color: true },
      rawArgs: ["--color"],
    },
    {
      label: "sets the value to false when --no-flag is provided",
      argv: ["--no-color"],
      options: { color: false },
      rawArgs: ["--no-color"],
    },
  ])("parseCommandArgs $label", async ({ argv, options, rawArgs }) => {
    const result = await parseCommandArgs(createNegatableColorCommand(), argv);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options,
        rawArgs,
      },
    });
  });

  test("parseCommandArgs fails when both --flag and --no-flag are provided", async () => {
    const result = await parseCommandArgs(createNegatableColorCommand(), ["--color", "--no-color"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Conflicting options: "--color" and "--no-color" cannot be used together',
      },
    });
  });

  test("parseCommandArgs rejects duplicate --no-flag", async () => {
    const result = await parseCommandArgs(createNegatableColorCommand(), [
      "--no-color",
      "--no-color",
    ]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Duplicate option "--no-color" is not supported',
      },
    });
  });

  test("parseCommandArgs does not generate --no-flag for boolean options without default true", async () => {
    const command = defineCommand({
      options: [{ name: "force", type: "boolean" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--no-force"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Unknown option "--no-force"',
      },
    });
  });

  test("parseCommandArgs supports --no-flag with kebab-case option names", async () => {
    const command = defineCommand({
      options: [{ name: "dry-run", type: "boolean", default: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--no-dry-run"]);

    expect(result).toMatchObject({
      ok: true,
      value: {
        options: { "dry-run": false, dryRun: false },
      },
    });
  });
});

describe("parseCommandArgs edge cases", () => {
  test("parseCommandArgs respects the -- separator", async () => {
    const command = defineCommand({
      args: [{ name: "value", type: "string", required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--", "--literal"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { value: "--literal" },
        options: {},
        rawArgs: ["--", "--literal"],
      },
    });
  });

  test("parseCommandArgs fails on unknown options", async () => {
    const command = defineCommand({
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--wat"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Unknown option "--wat"',
      },
    });
  });

  test("parseCommandArgs fails on unknown short options", async () => {
    const command = defineCommand({
      async run() {},
    });

    const result = await parseCommandArgs(command, ["-w"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Unknown option "-w"',
      },
    });
  });

  test.each([
    {
      label: "duplicate long options",
      define: () =>
        defineCommand({
          options: [{ name: "name", type: "string" }],
          async run() {},
        }),
      argv: ["--name", "foo", "--name", "bar"],
      message: 'Duplicate option "--name <string>" is not supported',
    },
    {
      label: "duplicate options across long and short forms",
      define: () =>
        defineCommand({
          options: [{ name: "name", type: "string", short: "n" }],
          async run() {},
        }),
      argv: ["--name", "foo", "-n", "bar"],
      message: 'Duplicate option "--name <string>" is not supported',
    },
    {
      label: "duplicate boolean options",
      define: () =>
        defineCommand({
          options: [{ name: "force", type: "boolean" }],
          async run() {},
        }),
      argv: ["--force", "--force"],
      message: 'Duplicate option "--force" is not supported',
    },
  ])("parseCommandArgs rejects $label", async ({ define, argv, message }) => {
    const result = await parseCommandArgs(define() as unknown as DefinedCommand, argv);

    expect(result).toEqual({
      ok: false,
      error: {
        message,
      },
    });
  });

  test("parseCommandArgs rejects extra positional arguments", async () => {
    const command = defineCommand({
      args: [{ name: "value", type: "string", required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["one", "two"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Unexpected argument "two"',
      },
    });
  });

  test("parseCommandArgs adds camelCase aliases for kebab-case fields", async () => {
    const command = defineCommand({
      args: [{ name: "my-arg", type: "string", required: true }],
      options: [{ name: "dry-run", type: "boolean" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["hello", "--dry-run"]);

    expect(result).toMatchObject({
      ok: true,
      value: {
        args: { "my-arg": "hello", myArg: "hello" },
        options: { "dry-run": true, dryRun: true },
      },
    });
  });
});
