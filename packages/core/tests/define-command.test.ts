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

test("defineCommand normalizes omitted examples to empty array", () => {
  const command = defineCommand({
    async run() {},
  });

  expect(command.examples).toEqual([]);
});

test("defineCommand preserves examples", () => {
  const command = defineCommand({
    examples: ["my-cli greet Alice", "my-cli greet --loud Bob"],
    async run() {},
  });

  expect(command.examples).toEqual(["my-cli greet Alice", "my-cli greet --loud Bob"]);
});

test("defineCommand preserves description and field definitions", () => {
  const command = defineCommand({
    description: "Create a project",
    args: [{ name: "id", type: "string", required: true }],
    options: [
      { name: "name", type: "string", required: true },
      { name: "force", type: "boolean", short: "f" },
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
// Name & short name validation
// ---------------------------------------------------------------------------

test("defineCommand accepts valid kebab-case names", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "file-path", type: "string", required: true }],
      options: [
        { name: "dry-run", type: "boolean" },
        { name: "output", type: "string", short: "o" },
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

test("defineCommand rejects options whose camelCase aliases collide (kebab first)", () => {
  expect(() =>
    defineCommand({
      options: [
        { name: "foo-bar", type: "string" },
        { name: "fooBar", type: "string" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate option name "fooBar".');
});

test("defineCommand rejects options whose camelCase aliases collide (camel first)", () => {
  expect(() =>
    defineCommand({
      options: [
        { name: "fooBar", type: "string" },
        { name: "foo-bar", type: "string" },
      ],
      async run() {},
    }),
  ).toThrow('Option "foo-bar" conflicts with "fooBar" (same camelCase alias).');
});

test("defineCommand rejects args whose camelCase aliases collide", () => {
  expect(() =>
    defineCommand({
      args: [
        { name: "my-arg", type: "string", required: true },
        { name: "myArg", type: "string" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate argument name "myArg".');
});

test("defineCommand rejects hyphenated arg names with consecutive hyphens", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "my--arg", type: "string" }],
      async run() {},
    }),
  ).toThrow('Invalid argument name "my--arg"');
});

test("defineCommand rejects hyphenated arg names with leading hyphen", () => {
  expect(() =>
    defineCommand({
      args: [{ name: "-arg", type: "string" }],
      async run() {},
    }),
  ).toThrow('Invalid argument name "-arg"');
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

test("defineCommand rejects invalid short name", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "verbose", type: "boolean", short: "vv" }],
      async run() {},
    }),
  ).toThrow('Invalid short name "vv" for option "verbose"');
});

test("defineCommand rejects numeric short name", () => {
  expect(() =>
    defineCommand({
      options: [{ name: "verbose", type: "boolean", short: "1" }],
      async run() {},
    }),
  ).toThrow('Invalid short name "1" for option "verbose"');
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

test("defineCommand rejects duplicate option short names", () => {
  expect(() =>
    defineCommand({
      options: [
        { name: "force", type: "boolean", short: "f" },
        { name: "file", type: "string", short: "f" },
      ],
      async run() {},
    }),
  ).toThrow('Duplicate short name "f" for option "file"');
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
