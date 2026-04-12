import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import type { CommandArgField, CommandOptionField, SingleLetter } from "../src/field-types";

import { defineCommand } from "../src";

describe("basic structure", () => {
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
});

describe("argument ordering", () => {
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
      // @ts-expect-error required arg after optional arg is a type error
      defineCommand({
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
      // @ts-expect-error required arg after arg with default is a type error
      defineCommand({
        args: [
          { name: "source", type: "string", default: "." },
          { name: "target", type: "string", required: true },
        ],
        async run() {},
      }),
    ).toThrow('Required argument "target" cannot follow optional argument "source"');
  });
});

describe("name and short name validation", () => {
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
      // @ts-expect-error camelCase alias collision
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
      // @ts-expect-error camelCase alias collision
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
      // @ts-expect-error camelCase alias collision
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
      // @ts-expect-error invalid hyphenated name
      defineCommand({
        args: [{ name: "my--arg", type: "string" }],
        async run() {},
      }),
    ).toThrow('Invalid argument name "my--arg"');
  });

  test("defineCommand rejects hyphenated arg names with leading hyphen", () => {
    expect(() =>
      // @ts-expect-error invalid hyphenated name
      defineCommand({
        args: [{ name: "-arg", type: "string" }],
        async run() {},
      }),
    ).toThrow('Invalid argument name "-arg"');
  });

  test("defineCommand rejects option name with spaces", () => {
    expect(() =>
      // @ts-expect-error invalid option name
      defineCommand({
        options: [{ name: "my option", type: "string" }],
        async run() {},
      }),
    ).toThrow('Invalid option name "my option"');
  });

  test("defineCommand rejects empty option name", () => {
    expect(() =>
      // @ts-expect-error empty name
      defineCommand({
        options: [{ name: "", type: "string" }],
        async run() {},
      }),
    ).toThrow('Invalid option name ""');
  });

  test("defineCommand rejects empty argument name", () => {
    expect(() =>
      // @ts-expect-error empty name
      defineCommand({
        args: [{ name: "", type: "string" }],
        async run() {},
      }),
    ).toThrow('Invalid argument name ""');
  });

  test("defineCommand rejects option name starting with a hyphen", () => {
    expect(() =>
      // @ts-expect-error invalid hyphenated name
      defineCommand({
        options: [{ name: "-verbose", type: "boolean" }],
        async run() {},
      }),
    ).toThrow('Invalid option name "-verbose"');
  });

  test("defineCommand rejects invalid short name", () => {
    expect(() =>
      defineCommand({
        // @ts-expect-error invalid short name
        options: [{ name: "verbose", type: "boolean", short: "vv" }],
        async run() {},
      }),
    ).toThrow('Invalid short name "vv" for option "verbose"');
  });

  test("defineCommand rejects numeric short name", () => {
    expect(() =>
      defineCommand({
        // @ts-expect-error invalid short name
        options: [{ name: "verbose", type: "boolean", short: "1" }],
        async run() {},
      }),
    ).toThrow('Invalid short name "1" for option "verbose"');
  });
});

describe("uniqueness and field shape validation", () => {
  test("defineCommand rejects duplicate option names", () => {
    expect(() =>
      // @ts-expect-error duplicate option name
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
      // @ts-expect-error duplicate short name
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
      // @ts-expect-error duplicate argument name
      defineCommand({
        args: [
          { name: "source", type: "string", required: true },
          { name: "source", type: "string" },
        ],
        async run() {},
      }),
    ).toThrow('Duplicate argument name "source"');
  });
});

describe("negation collision validation", () => {
  test("defineCommand rejects option named no-X when X is a negatable boolean option", () => {
    expect(() =>
      // @ts-expect-error negation collision
      defineCommand({
        options: [
          { name: "color", type: "boolean", default: true },
          { name: "no-color", type: "string" },
        ],
        async run() {},
      }),
    ).toThrow('Option "no-color" conflicts with the automatic negation of boolean option "color".');
  });

  test("defineCommand allows no-X option when X is not negatable", () => {
    expect(() =>
      defineCommand({
        options: [
          { name: "color", type: "boolean" },
          { name: "no-color", type: "string" },
        ],
        async run() {},
      }),
    ).not.toThrow();
  });
});

describe("reserved name validation", () => {
  test("defineCommand rejects option named help", () => {
    expect(() =>
      // @ts-expect-error reserved option name
      defineCommand({
        options: [{ name: "help", type: "boolean" }],
        async run() {},
      }),
    ).toThrow('Option name "help" is reserved by the framework.');
  });

  test("defineCommand rejects short name h", () => {
    expect(() =>
      // @ts-expect-error reserved short name
      defineCommand({
        options: [{ name: "header", type: "string", short: "h" }],
        async run() {},
      }),
    ).toThrow('Short name "h" for option "header" is reserved by the framework.');
  });

  test("defineCommand allows version option on non-root commands", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "version", type: "string" }],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("defineCommand allows -V short name", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "verbose", type: "boolean", short: "V" }],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("defineCommand rejects json option when json mode is enabled", () => {
    expect(() =>
      // @ts-expect-error reserved option name in json mode
      defineCommand({
        json: true,
        options: [{ name: "json", type: "boolean" }],
        async run() {
          return {};
        },
      }),
    ).toThrow('Option name "json" is reserved by the framework.');
  });

  test("defineCommand allows json option when json mode is not enabled", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "json", type: "boolean" }],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("defineCommand allows non-reserved short names", () => {
    expect(() =>
      defineCommand({
        options: [{ name: "verbose", type: "boolean", short: "v" }],
        async run() {},
      }),
    ).not.toThrow();
  });
});

describe("widened input pass-through", () => {
  test("widened option arrays with camelCase collision pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [
      { name: "foo-bar", type: "string" },
      { name: "fooBar", type: "string" },
    ];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/Duplicate option name/);
  });

  test("widened arg arrays with duplicate names pass type check and are caught at runtime", () => {
    const fields: readonly CommandArgField[] = [
      { name: "input", type: "string" },
      { name: "input", type: "string" },
    ];

    expect(() => defineCommand({ args: fields, run() {} })).toThrow(/Duplicate/);
  });

  test("widened option arrays with duplicate short names pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [
      { name: "verbose", type: "boolean", short: "v" },
      { name: "version", type: "boolean", short: "v" },
    ];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/Duplicate short/);
  });

  test("widened option arrays with invalid names pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [{ name: "-bad", type: "string" }];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/Invalid option name/);
  });

  test("widened arg arrays with empty names pass type check and are caught at runtime", () => {
    const fields: readonly CommandArgField[] = [{ name: "", type: "string" }];

    expect(() => defineCommand({ args: fields, run() {} })).toThrow(/Invalid argument name/);
  });

  test("widened option arrays with reserved names pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [{ name: "help", type: "boolean" }];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/reserved by the framework/);
  });

  test("widened option arrays with reserved short names pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [{ name: "header", type: "string", short: "h" }];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/reserved by the framework/);
  });

  test("widened option arrays with json name in json mode pass type check and are caught at runtime", () => {
    const fields: readonly CommandOptionField[] = [{ name: "json", type: "boolean" }];

    expect(() => defineCommand({ json: true, options: fields, run: () => ({}) })).toThrow(
      /reserved by the framework/,
    );
  });

  test("tuple with widened member names does not trigger false positive", () => {
    const dynamicName: string = "alpha";

    expect(() =>
      defineCommand({
        options: [
          { name: dynamicName, type: "string" },
          { name: "beta", type: "string" },
        ],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("tuple with widened short name does not trigger false positive", () => {
    const dynamicShort = "a" as SingleLetter;

    expect(() =>
      defineCommand({
        options: [
          { name: "alpha", type: "string", short: dynamicShort },
          { name: "beta", type: "string", short: "b" },
        ],
        async run() {},
      }),
    ).not.toThrow();
  });
});
