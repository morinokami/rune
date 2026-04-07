import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expectTypeOf, test } from "vite-plus/test";
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

test("defineCommand exposes camelCase aliases for kebab-case field names", () => {
  const cmd = defineCommand({
    args: [{ name: "my-arg", type: "string", required: true }],
    options: [
      { name: "dry-run", type: "boolean" },
      { name: "output-dir", type: "string", required: true },
    ],
    async run(ctx) {
      // camelCase access
      expectTypeOf(ctx.args.myArg).toEqualTypeOf<string>();
      expectTypeOf(ctx.options.dryRun).toEqualTypeOf<boolean>();
      expectTypeOf(ctx.options.outputDir).toEqualTypeOf<string>();

      // original kebab-case access still works
      expectTypeOf(ctx.args["my-arg"]).toEqualTypeOf<string>();
      expectTypeOf(ctx.options["dry-run"]).toEqualTypeOf<boolean>();
      expectTypeOf(ctx.options["output-dir"]).toEqualTypeOf<string>();
    },
  });

  expectTypeOf<InferCommandArgs<typeof cmd>>().toEqualTypeOf<{
    "my-arg": string;
    myArg: string;
  }>();
  expectTypeOf<InferCommandOptions<typeof cmd>>().toEqualTypeOf<{
    "dry-run": boolean;
    dryRun: boolean;
    "output-dir": string;
    outputDir: string;
  }>();
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

describe("type-level field name validation", () => {
  test("defineCommand rejects empty field names at compile time", () => {
    void ((input: { args: [{ name: ""; type: "string" }]; run: () => void }) => {
      // @ts-expect-error empty arg name
      defineCommand(input);
    });

    void ((input: { options: [{ name: ""; type: "string" }]; run: () => void }) => {
      // @ts-expect-error empty option name
      defineCommand(input);
    });
  });

  test("defineCommand rejects invalid hyphenated names at compile time", () => {
    void ((input: { args: [{ name: "my--arg"; type: "string" }]; run: () => void }) => {
      // @ts-expect-error consecutive hyphens
      defineCommand(input);
    });

    void ((input: { options: [{ name: "-verbose"; type: "boolean" }]; run: () => void }) => {
      // @ts-expect-error leading hyphen
      defineCommand(input);
    });

    void ((input: { options: [{ name: "verbose-"; type: "boolean" }]; run: () => void }) => {
      // @ts-expect-error trailing hyphen
      defineCommand(input);
    });
  });
});

describe("type-level duplicate and collision detection", () => {
  test("defineCommand rejects duplicate field names at compile time", () => {
    void ((input: {
      options: [{ name: "force"; type: "boolean" }, { name: "force"; type: "boolean" }];
      run: () => void;
    }) => {
      // @ts-expect-error duplicate option name
      defineCommand(input);
    });

    void ((input: {
      args: [{ name: "id"; type: "string"; required: true }, { name: "id"; type: "string" }];
      run: () => void;
    }) => {
      // @ts-expect-error duplicate arg name
      defineCommand(input);
    });
  });

  test("defineCommand rejects camelCase alias collision at compile time", () => {
    void ((input: {
      options: [{ name: "foo-bar"; type: "string" }, { name: "fooBar"; type: "string" }];
      run: () => void;
    }) => {
      // @ts-expect-error camelCase collision (kebab first)
      defineCommand(input);
    });

    void ((input: {
      options: [{ name: "fooBar"; type: "string" }, { name: "foo-bar"; type: "string" }];
      run: () => void;
    }) => {
      // @ts-expect-error camelCase collision (camel first)
      defineCommand(input);
    });

    void ((input: {
      args: [{ name: "my-arg"; type: "string"; required: true }, { name: "myArg"; type: "string" }];
      run: () => void;
    }) => {
      // @ts-expect-error camelCase collision in args
      defineCommand(input);
    });
  });

  test("defineCommand rejects duplicate short names at compile time", () => {
    void ((input: {
      options: [
        { name: "force"; type: "boolean"; short: "f" },
        { name: "file"; type: "string"; short: "f" },
      ];
      run: () => void;
    }) => {
      // @ts-expect-error duplicate short name
      defineCommand(input);
    });
  });

  test("defineCommand rejects invalid short name format at compile time", () => {
    void ((input: {
      options: [{ name: "verbose"; type: "boolean"; short: "vv" }];
      run: () => void;
    }) => {
      // @ts-expect-error multi-character short name
      defineCommand(input);
    });

    void ((input: {
      options: [{ name: "verbose"; type: "boolean"; short: "1" }];
      run: () => void;
    }) => {
      // @ts-expect-error numeric short name
      defineCommand(input);
    });
  });
});

describe("type-level negation collision detection", () => {
  test("defineCommand rejects option named no-X when X is a negatable boolean at compile time", () => {
    void ((input: {
      options: [
        { name: "color"; type: "boolean"; default: true },
        { name: "no-color"; type: "string" },
      ];
      run: () => void;
    }) => {
      // @ts-expect-error negation collision
      defineCommand(input);
    });
  });

  test("defineCommand allows no-X option when X is boolean without default true", () => {
    void ((input: {
      options: [{ name: "color"; type: "boolean" }, { name: "no-color"; type: "string" }];
      run: () => void;
    }) => {
      defineCommand(input);
    });
  });

  test("defineCommand allows no-X option when X is boolean with default false", () => {
    void ((input: {
      options: [
        { name: "color"; type: "boolean"; default: false },
        { name: "no-color"; type: "string" },
      ];
      run: () => void;
    }) => {
      defineCommand(input);
    });
  });
});

describe("type-level compound validation errors", () => {
  test("multiple validators firing simultaneously do not collapse to plain never", () => {
    // Empty duplicate names: triggers both ValidateFieldNames (empty name) and
    // ValidateUniqueNames (duplicate name). Each should produce its own
    // ErrorMessage instead of collapsing to never.
    void ((input: {
      args: [{ name: ""; type: "string" }, { name: ""; type: "string" }];
      run: () => void;
    }) => {
      // @ts-expect-error invalid + duplicate arg name (compound error)
      defineCommand(input);
    });

    // Required-after-optional with duplicate names: triggers both
    // ValidateArgOrder and ValidateUniqueNames on args.
    void ((input: {
      args: [{ name: "x"; type: "string" }, { name: "x"; type: "string"; required: true }];
      run: () => void;
    }) => {
      // @ts-expect-error invalid order + duplicate arg name (compound error)
      defineCommand(input);
    });

    // Duplicate option name + duplicate short: triggers both
    // ValidateUniqueNames and ValidateDuplicateShortNames on options.
    void ((input: {
      options: [
        { name: "force"; type: "boolean"; short: "f" },
        { name: "force"; type: "boolean"; short: "f" },
      ];
      run: () => void;
    }) => {
      // @ts-expect-error duplicate name + duplicate short (compound error)
      defineCommand(input);
    });
  });
});
