import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineCommand } from "../src";
import { parseCommand } from "../src/parse-command";

// ---------------------------------------------------------------------------
// Primitive fields
// ---------------------------------------------------------------------------

test("parseCommand parses args, options, aliases, booleans, and defaults", async () => {
  const command = defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    options: [
      { name: "name", type: "string", required: true },
      { name: "force", type: "boolean", alias: "f" },
      { name: "count", type: "number", default: 1 },
    ],
    async run() {},
  });

  const result = await parseCommand(command, ["123", "--name", "rune", "-f"]);

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

test("parseCommand supports --name=value syntax", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["--name=rune"]);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: { name: "rune" },
      rawArgs: ["--name=rune"],
    },
  });
});

test("parseCommand applies default option values", async () => {
  const command = defineCommand({
    options: [{ name: "count", type: "number", default: 1 }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: { count: 1 },
      rawArgs: [],
    },
  });
});

test("parseCommand applies default argument values", async () => {
  const command = defineCommand({
    args: [{ name: "mode", type: "string", default: "dev" }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: { mode: "dev" },
      options: {},
      rawArgs: [],
    },
  });
});

test("parseCommand omits optional primitive args that are not provided", async () => {
  const command = defineCommand({
    args: [{ name: "target", type: "string" }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: {},
      rawArgs: [],
    },
  });
});

test("parseCommand defaults omitted boolean options to false", async () => {
  const command = defineCommand({
    options: [{ name: "force", type: "boolean" }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: { force: false },
      rawArgs: [],
    },
  });
});

test("parseCommand succeeds for commands without fields", async () => {
  const command = defineCommand({
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: {},
      rawArgs: [],
    },
  });
});

// ---------------------------------------------------------------------------
// Schema fields
// ---------------------------------------------------------------------------

test("parseCommand validates and accepts a schema-backed arg", async () => {
  const command = defineCommand({
    args: [{ name: "id", schema: z.string().uuid() }],
    async run() {},
  });

  const id = "550e8400-e29b-41d4-a716-446655440000";
  const result = await parseCommand(command, [id]);

  expect(result).toEqual({
    ok: true,
    value: {
      args: { id },
      options: {},
      rawArgs: [id],
    },
  });
});

test("parseCommand validates and accepts a schema-backed option", async () => {
  const command = defineCommand({
    options: [{ name: "port", schema: z.coerce.number().int().positive() }],
    async run() {},
  });

  const result = await parseCommand(command, ["--port", "3000"]);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: { port: 3000 },
      rawArgs: ["--port", "3000"],
    },
  });
});

test("parseCommand treats schema-backed optional options as optional when undefined validates", async () => {
  const command = defineCommand({
    options: [{ name: "mode", schema: z.string().optional() }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: {},
      rawArgs: [],
    },
  });
});

test("parseCommand supports schema-backed boolean-like flags", async () => {
  const command = defineCommand({
    options: [{ name: "force", schema: z.boolean(), flag: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["--force"]);

  expect(result).toEqual({
    ok: true,
    value: {
      args: {},
      options: { force: true },
      rawArgs: ["--force"],
    },
  });
});

// ---------------------------------------------------------------------------
// Error cases: missing required fields
// ---------------------------------------------------------------------------

test("parseCommand fails when a required option is missing", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: false,
    error: {
      message: "Missing required option:\n\n  --name <string>",
    },
  });
});

test("parseCommand fails when a required argument is missing", async () => {
  const command = defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: false,
    error: {
      message: "Missing required argument:\n\n  id",
    },
  });
});

test("parseCommand fails when a required schema-backed option is missing", async () => {
  const command = defineCommand({
    options: [{ name: "token", schema: z.string() }],
    async run() {},
  });

  const result = await parseCommand(command, []);

  expect(result).toEqual({
    ok: false,
    error: {
      message: "Missing required option:\n\n  --token",
    },
  });
});

// ---------------------------------------------------------------------------
// Error cases: invalid values
// ---------------------------------------------------------------------------

test("parseCommand fails when a number option is invalid", async () => {
  const command = defineCommand({
    options: [{ name: "count", type: "number", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["--count", "abc"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Invalid value for option --count <number>:\n\n  Expected number, received "abc"',
    },
  });
});

test("parseCommand fails when a number argument is invalid", async () => {
  const command = defineCommand({
    args: [{ name: "count", type: "number", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["oops"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Invalid value for argument count:\n\n  Expected number, received "oops"',
    },
  });
});

test("parseCommand fails when a schema-backed arg is invalid", async () => {
  const command = defineCommand({
    args: [{ name: "id", schema: z.string().uuid() }],
    async run() {},
  });

  const result = await parseCommand(command, ["bad"]);

  expect(result.ok).toBe(false);

  if (result.ok) return;
  expect(result.error.message).toContain("Invalid value for argument id");
});

// ---------------------------------------------------------------------------
// parseArgs edge cases
// ---------------------------------------------------------------------------

test("parseCommand respects the -- separator", async () => {
  const command = defineCommand({
    args: [{ name: "value", type: "string", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["--", "--literal"]);

  expect(result).toEqual({
    ok: true,
    value: {
      args: { value: "--literal" },
      options: {},
      rawArgs: ["--", "--literal"],
    },
  });
});

test("parseCommand fails on unknown options", async () => {
  const command = defineCommand({
    async run() {},
  });

  const result = await parseCommand(command, ["--wat"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Unknown option "--wat"',
    },
  });
});

test("parseCommand rejects duplicate options", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string" }],
    async run() {},
  });

  const result = await parseCommand(command, ["--name", "foo", "--name", "bar"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Duplicate option "--name <string>" is not supported',
    },
  });
});

test("parseCommand rejects duplicate options across long and alias forms", async () => {
  const command = defineCommand({
    options: [{ name: "name", type: "string", alias: "n" }],
    async run() {},
  });

  const result = await parseCommand(command, ["--name", "foo", "-n", "bar"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Duplicate option "--name <string>" is not supported',
    },
  });
});

test("parseCommand rejects extra positional arguments", async () => {
  const command = defineCommand({
    args: [{ name: "value", type: "string", required: true }],
    async run() {},
  });

  const result = await parseCommand(command, ["one", "two"]);

  expect(result).toEqual({
    ok: false,
    error: {
      message: 'Unexpected argument "two"',
    },
  });
});
