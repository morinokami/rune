import type { StandardSchemaV1 } from "@standard-schema/spec";

import { expect, test } from "vite-plus/test";
import { z } from "zod";

import { defineCommand } from "../src";

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
    options: [{ name: "force", schema: forceSchema, flag: true, description: "Force execution" }],
    async run() {},
  });

  expect(command.options).toEqual([
    { name: "force", schema: forceSchema, flag: true, description: "Force execution" },
  ]);
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
