import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import type { InferCommandArgs, InferCommandOptions } from "../../src/core/command-types";
import type { CommandOptionField } from "../../src/core/field-types";

import { defineCommand } from "../../src/core";
import { parseCommandArgs } from "../../src/core/parse-command-args";

describe("enum field type inference", () => {
  test("enum option infers union of literal values without `as const`", () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"] }],
      async run() {},
    });

    expectTypeOf<InferCommandOptions<typeof command>>().toEqualTypeOf<{
      mode?: "dev" | "prod";
    }>();
  });

  test("enum option with default is inferred as required", () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"], default: "dev" }],
      async run() {},
    });

    expectTypeOf<InferCommandOptions<typeof command>>().toEqualTypeOf<{
      mode: "dev" | "prod";
    }>();
  });

  test("enum multiple option infers arrays of literal values", () => {
    const command = defineCommand({
      options: [
        { name: "mode", type: "enum", values: ["dev", "prod"], multiple: true, default: [] },
      ],
      async run() {},
    });

    expectTypeOf<InferCommandOptions<typeof command>>().toEqualTypeOf<{
      mode: ("dev" | "prod")[];
    }>();
  });

  test("enum option with required=true is required", () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"], required: true }],
      async run() {},
    });

    expectTypeOf<InferCommandOptions<typeof command>>().toEqualTypeOf<{
      mode: "dev" | "prod";
    }>();
  });

  test("enum arg accepts mixed string and number values", () => {
    const command = defineCommand({
      args: [{ name: "level", type: "enum", values: ["low", 1, "high"], required: true }],
      async run() {},
    });

    expectTypeOf<InferCommandArgs<typeof command>>().toEqualTypeOf<{
      level: "low" | 1 | "high";
    }>();
  });
});

describe("enum field parsing", () => {
  test("matches string values", async () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--mode", "prod"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { mode: "prod" },
        rawArgs: ["--mode", "prod"],
      },
    });
  });

  test("matches numeric values using strict string comparison", async () => {
    const command = defineCommand({
      options: [{ name: "n", type: "enum", values: [1, 2, 3], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--n", "2"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { n: 2 },
        rawArgs: ["--n", "2"],
      },
    });
  });

  test("rejects numeric tokens that stringify differently from the declared value", async () => {
    const command = defineCommand({
      options: [{ name: "n", type: "enum", values: [1, 2, 3], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--n", "007"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message: 'Invalid value for option --n:\n\n  Expected one of: 1, 2, 3. Received: "007".',
      },
    });
  });

  test("rejects values not in the list", async () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["--mode", "staging"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message:
          'Invalid value for option --mode:\n\n  Expected one of: dev, prod. Received: "staging".',
      },
    });
  });

  test("applies enum default when the option is omitted", async () => {
    const command = defineCommand({
      options: [{ name: "mode", type: "enum", values: ["dev", "prod"], default: "dev" }],
      async run() {},
    });

    const result = await parseCommandArgs(command, []);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { mode: "dev" },
        rawArgs: [],
      },
    });
  });

  test("parses enum positional arguments", async () => {
    const command = defineCommand({
      args: [{ name: "mode", type: "enum", values: ["dev", "prod"], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["dev"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: { mode: "dev" },
        options: {},
        rawArgs: ["dev"],
      },
    });
  });

  test("rejects enum positional arguments with helpful message", async () => {
    const command = defineCommand({
      args: [{ name: "mode", type: "enum", values: ["dev", "prod"], required: true }],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["staging"]);

    expect(result).toEqual({
      ok: false,
      error: {
        message:
          'Invalid value for argument mode:\n\n  Expected one of: dev, prod. Received: "staging".',
      },
    });
  });

  test("supports enum option short names", async () => {
    const command = defineCommand({
      options: [
        { name: "mode", type: "enum", values: ["dev", "prod"], short: "m", required: true },
      ],
      async run() {},
    });

    const result = await parseCommandArgs(command, ["-m", "prod"]);

    expect(result).toEqual({
      ok: true,
      value: {
        args: {},
        options: { mode: "prod" },
        rawArgs: ["-m", "prod"],
      },
    });
  });
});

describe("enum definition-time validation", () => {
  test("rejects empty values array", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: [] as const }],
        async run() {},
      }),
    ).toThrow(/must declare at least one value/);
  });

  test("rejects duplicate values (after string conversion)", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: ["1", 1] }],
        async run() {},
      }),
    ).toThrow(/duplicate value/i);
  });

  test("rejects empty string values", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: ["", "x"] }],
        async run() {},
      }),
    ).toThrow(/empty string/);
  });

  test("rejects string values with disallowed characters", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: ["a b", "c"] }],
        async run() {},
      }),
    ).toThrow(/invalid string value/);

    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: ["ok", "a|b"] }],
        async run() {},
      }),
    ).toThrow(/invalid string value/);
  });

  test("accepts identifier-like string values including dots and hyphens", () => {
    expect(() =>
      defineCommand({
        options: [
          {
            name: "mode",
            type: "enum",
            values: ["dev", "prod", "v1.0", "low-latency", "snake_case"],
          },
        ],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("rejects NaN and Infinity", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "n", type: "enum", values: [1, Number.NaN] }],
        async run() {},
      }),
    ).toThrow(/NaN or Infinity/);

    expect(() =>
      defineCommand({
        options: [{ name: "n", type: "enum", values: [1, Number.POSITIVE_INFINITY] }],
        async run() {},
      }),
    ).toThrow(/NaN or Infinity/);
  });

  test("rejects default not in values", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "mode", type: "enum", values: ["dev", "prod"], default: "staging" }],
        async run() {},
      }),
    ).toThrow(/not listed in "values"/);
  });

  test("rejects multiple default values not in values", () => {
    const fields = [
      {
        name: "mode",
        type: "enum",
        values: ["dev", "prod"],
        multiple: true,
        default: ["dev", "staging"],
      },
    ] as unknown as readonly CommandOptionField[];

    expect(() =>
      defineCommand({
        options: fields,
        async run() {},
      }),
    ).toThrow('Default value "staging" for enum option "mode" is not listed in "values".');
  });
});
