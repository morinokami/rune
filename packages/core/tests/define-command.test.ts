import type { StandardSchemaV1 } from "@standard-schema/spec";

import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineCommand } from "../src";

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

test("defineCommand normalizes empty args and options", () => {
  const command = defineCommand({
    async run() {},
  });

  expect(command.args).toEqual([]);
  expect(command.options).toEqual([]);
});

test("defineCommand preserves description and field definitions", () => {
  const command = defineCommand({
    description: "Create a project",
    args: [{ name: "id", type: "string", required: true }],
    options: [
      { name: "name", type: "string", required: true },
      { name: "force", type: "boolean", alias: "f" },
    ],
    async run() {},
  });

  expect(command.description).toBe("Create a project");
  expect(command.args).toHaveLength(1);
  expect(command.options).toHaveLength(2);
});

test("defineCommand preserves schema-backed and default-backed field definitions", () => {
  const modeSchema = z.string().optional();
  const tokenSchema = z.string();
  const command = defineCommand({
    args: [
      { name: "id", type: "string", required: true },
      { name: "mode", schema: modeSchema },
    ],
    options: [
      { name: "count", type: "number", default: 1 },
      { name: "token", schema: tokenSchema },
    ],
    async run() {},
  });

  expect(command.args).toEqual([
    { name: "id", type: "string", required: true },
    { name: "mode", schema: modeSchema },
  ]);
  expect(command.options).toEqual([
    { name: "count", type: "number", default: 1 },
    { name: "token", schema: tokenSchema },
  ]);
});

test("defineCommand accepts explicit flag hints for schema-backed options", () => {
  const forceSchema = z.boolean();
  const command = defineCommand({
    options: [
      {
        name: "force",
        schema: forceSchema,
        flag: true,
        description: "Force execution",
      },
    ],
    async run() {},
  });

  expect(command.options).toEqual([
    {
      name: "force",
      schema: forceSchema,
      flag: true,
      description: "Force execution",
    },
  ]);
});

test("defineCommand rejects missing run function", () => {
  expect(() => defineCommand({} as any)).toThrow('defineCommand() requires a "run" function.');
});

// ---------------------------------------------------------------------------
// Argument ordering
// ---------------------------------------------------------------------------

test("defineCommand allows optional args after required args", () => {
  expect(() =>
    defineCommand({
      args: [
        { name: "source", type: "string", required: true },
        { name: "target", type: "string" },
      ],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand allows args with defaults before optional args", () => {
  expect(() =>
    defineCommand({
      args: [
        { name: "source", type: "string", default: "." },
        { name: "target", type: "string" },
      ],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand skips schema args in runtime ordering check", () => {
  // Schema fields lack optionality metadata at runtime, so defineCommand
  // skips them during ordering validation. The type-level check
  // (ValidateArgOrder) catches invalid orderings when concrete types are
  // available; this test documents the runtime behavior.
  const optionalSchema: StandardSchemaV1 = z.string().optional();

  expect(() =>
    defineCommand({
      args: [
        { name: "mode", schema: optionalSchema },
        { name: "target", type: "string", required: true },
      ],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand accepts widened schema args without false positive", () => {
  const requiredSchema: StandardSchemaV1 = z.string();

  expect(() =>
    defineCommand({
      args: [
        { name: "id", schema: requiredSchema },
        { name: "target", type: "string", required: true },
      ],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand rejects required arg after optional arg", () => {
  expect(() =>
    defineCommand({
      // @ts-expect-error required arg after optional arg is a type error
      args: [
        { name: "source", type: "string" },
        { name: "target", type: "string", required: true },
      ],
      async run() {},
    }),
  ).toThrow('Required argument "target" cannot follow optional argument "source"');
});

test("defineCommand rejects required arg after arg with default", () => {
  expect(() =>
    defineCommand({
      // @ts-expect-error required arg after arg with default is a type error
      args: [
        { name: "source", type: "string", default: "." },
        { name: "target", type: "string", required: true },
      ],
      async run() {},
    }),
  ).toThrow('Required argument "target" cannot follow optional argument "source"');
});

// ---------------------------------------------------------------------------
// Name & alias validation
// ---------------------------------------------------------------------------

test("defineCommand accepts valid kebab-case names", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "file-path", type: "string", required: true }],
      options: [
        { name: "dry-run", type: "boolean" },
        { name: "output", type: "string", alias: "o" },
      ],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand accepts camelCase names for args and options", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "projectName", type: "string", required: true }],
      options: [{ name: "dryRun", type: "boolean" }],
      async run() {},
    }),
  ).not.toThrow();
});

test("defineCommand rejects option name with spaces", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "my option", type: "string" }],
      async run() {},
    }),
  ).toThrow('Invalid option name "my option"');
});

test("defineCommand rejects empty option name", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "", type: "string" }],
      async run() {},
    }),
  ).toThrow('Invalid option name ""');
});

test("defineCommand rejects empty argument name", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "", type: "string" }],
      async run() {},
    }),
  ).toThrow('Invalid argument name ""');
});

test("defineCommand rejects option name starting with a hyphen", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "-verbose", type: "boolean" }],
      async run() {},
    }),
  ).toThrow('Invalid option name "-verbose"');
});

test("defineCommand rejects invalid alias", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "verbose", type: "boolean", alias: "vv" }],
      async run() {},
    }),
  ).toThrow('Invalid alias "vv" for option "verbose"');
});

test("defineCommand rejects numeric alias", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "verbose", type: "boolean", alias: "1" }],
      async run() {},
    }),
  ).toThrow('Invalid alias "1" for option "verbose"');
});

// ---------------------------------------------------------------------------
// Uniqueness & field shape validation
// ---------------------------------------------------------------------------

test("defineCommand rejects duplicate option names", () => {
  expect(() =>
    defineCommand({
      options: [
        { name: "force", type: "boolean" },
        { name: "force", type: "boolean" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate option name "force"');
});

test("defineCommand rejects duplicate option aliases", () => {
  expect(() =>
    defineCommand({
      options: [
        { name: "force", type: "boolean", alias: "f" },
        { name: "file", type: "string", alias: "f" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate alias "f" for option "file"');
});

test("defineCommand rejects duplicate argument names", () => {
  expect(() =>
    defineCommand({
      args: [
        { name: "source", type: "string", required: true },
        { name: "source", type: "string" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate argument name "source"');
});

test("defineCommand rejects arg with no type or schema", () => {
  expect(() =>
    defineCommand({
      // @ts-expect-error missing type and schema
      args: [{ name: "x" }],
      async run() {},
    }),
  ).toThrow('Argument "x" must have either a "type" or "schema" property.');
});

test("defineCommand rejects option with no type or schema", () => {
  expect(() =>
    defineCommand({
      // @ts-expect-error missing type and schema
      options: [{ name: "verbose" }],
      async run() {},
    }),
  ).toThrow('Option "verbose" must have either a "type" or "schema" property.');
});
