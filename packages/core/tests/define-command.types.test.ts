import type { StandardSchemaV1 } from "@standard-schema/spec";

import { expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import { defineCommand } from "../src";
import { type InferCommandArgs, type InferCommandOptions } from "../src/command-types";

test("defineCommand infers primitive arg and option shapes", () => {
  const basicCommand = defineCommand({
    description: "Create a project",
    args: [{ name: "id", type: "string", required: true }],
    options: [
      { name: "name", type: "string", required: true },
      { name: "force", type: "boolean", short: "f" },
    ],
    async run() {},
  });

  expectTypeOf<InferCommandArgs<typeof basicCommand>>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<InferCommandOptions<typeof basicCommand>>().toEqualTypeOf<{
    name: string;
    force: boolean;
  }>();
});

test("defineCommand infers schema-backed and default-backed field types", () => {
  const schemaBackedCommand = defineCommand({
    args: [
      { name: "id", type: "string", required: true },
      { name: "mode", schema: z.string().optional() },
    ],
    options: [
      { name: "count", type: "number", default: 1 },
      { name: "token", schema: z.string() },
    ],
    async run(ctx) {
      expectTypeOf(ctx.args.id).toEqualTypeOf<string>();
      expectTypeOf(ctx.args.mode).toEqualTypeOf<string | undefined>();
      expectTypeOf(ctx.options.count).toEqualTypeOf<number>();
      expectTypeOf(ctx.options.token).toEqualTypeOf<string>();
    },
  });

  expectTypeOf<InferCommandArgs<typeof schemaBackedCommand>>().toEqualTypeOf<{
    id: string;
    mode?: string;
  }>();
  expectTypeOf<InferCommandOptions<typeof schemaBackedCommand>>().toEqualTypeOf<{
    count: number;
    token: string;
  }>();
});

test("defineCommand infers schema-backed flag options", () => {
  const schemaFlagCommand = defineCommand({
    options: [{ name: "force", schema: z.boolean(), flag: true }],
    async run(ctx) {
      expectTypeOf(ctx.options.force).toEqualTypeOf<boolean>();
    },
  });

  expectTypeOf<InferCommandOptions<typeof schemaFlagCommand>>().toEqualTypeOf<{ force: boolean }>();
});

test("defineCommand rejects invalid field shapes at compile time", () => {
  defineCommand({
    options: [{ name: "name", type: "string", required: true }],
    async run(ctx) {
      expectTypeOf(ctx.options.name).toEqualTypeOf<string>();

      // @ts-expect-error unknown option names must fail at compile time
      void ctx.options.missing;
    },
  });

  defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    async run(ctx) {
      expectTypeOf(ctx.args.id).toEqualTypeOf<string>();

      // @ts-expect-error unknown arg names must fail at compile time
      void ctx.args.missing;
    },
  });

  defineCommand({
    options: [
      // @ts-expect-error fields cannot declare both `type` and `schema`
      {
        name: "broken",
        type: "string",
        schema: null as unknown as StandardSchemaV1<string, string>,
      },
    ],
    async run() {},
  });

  defineCommand({
    options: [
      // @ts-expect-error primitive options cannot declare schema-specific flag hints
      { name: "broken", type: "boolean", flag: true },
    ],
    async run() {},
  });

  defineCommand({
    args: [
      { name: "id", schema: z.string() },
      { name: "target", type: "string" },
    ],
    async run() {},
  });
});
