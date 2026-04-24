import type { StandardSchemaV1 } from "@standard-schema/spec";

import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";

import type { CommandArgField, CommandOptionField, SingleLetter } from "../../src/core/field-types";

import { defineCommand, isDefinedCommand } from "../../src/core/define-command";

describe("normalization and pass-through", () => {
  test("defineCommand normalizes omitted args and options to empty arrays", () => {
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

  test("defineCommand normalizes omitted aliases to empty array", () => {
    const command = defineCommand({
      async run() {},
    });

    expect(command.aliases).toEqual([]);
  });

  test("defineCommand preserves description and field counts", () => {
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

  test("defineCommand preserves examples", () => {
    const command = defineCommand({
      examples: ["my-cli greet Alice", "my-cli greet --loud Bob"],
      async run() {},
    });

    expect(command.examples).toEqual(["my-cli greet Alice", "my-cli greet --loud Bob"]);
  });

  test("defineCommand preserves aliases", () => {
    const command = defineCommand({
      aliases: ["create", "new-project"],
      async run() {},
    });

    expect(command.aliases).toEqual(["create", "new-project"]);
  });

  test("defineCommand copies aliases and examples arrays", () => {
    const aliases = ["create"];
    const examples = ["my-cli create"];
    const command = defineCommand({
      aliases,
      examples,
      async run() {},
    });

    aliases.push("new-project");
    examples.push("my-cli new-project");

    expect(command.aliases).toEqual(["create"]);
    expect(command.examples).toEqual(["my-cli create"]);
  });

  test("defineCommand copies args and options arrays", () => {
    const args: CommandArgField[] = [{ name: "id", type: "string", required: true }];
    const options: CommandOptionField[] = [{ name: "force", type: "boolean" }];
    const command = defineCommand({
      args,
      options,
      async run() {},
    });

    args.push({ name: "mode", type: "string" });
    options.push({ name: "count", type: "number" });

    expect(command.args).toEqual([{ name: "id", type: "string", required: true }]);
    expect(command.options).toEqual([{ name: "force", type: "boolean" }]);
  });

  test("defineCommand preserves json mode and custom help handler", () => {
    const help = () => "custom help";
    const command = defineCommand({
      json: true,
      help,
      async run() {
        return {};
      },
    });

    expect(command.json).toBe(true);
    expect(command.help).toBe(help);
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

  test("defineCommand preserves explicit flag hints for schema-backed options", () => {
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

  test("defineCommand preserves multiple option definitions", () => {
    const command = defineCommand({
      options: [{ name: "tag", type: "string", multiple: true, default: [] }],
      async run() {},
    });

    expect(command.options).toEqual([{ name: "tag", type: "string", multiple: true, default: [] }]);
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

describe("field name validation", () => {
  test.each([{ name: "file-path" }, { name: "projectName" }])(
    'defineCommand accepts valid arg name "$name"',
    ({ name }) => {
      expect(() =>
        defineCommand({
          args: [{ name, type: "string", required: true }],
          async run() {},
        }),
      ).not.toThrow();
    },
  );

  test.each([{ name: "dry-run" }, { name: "dryRun" }])(
    'defineCommand accepts valid option name "$name"',
    ({ name }) => {
      expect(() =>
        defineCommand({
          options: [{ name, type: "boolean" }],
          async run() {},
        }),
      ).not.toThrow();
    },
  );

  test.each([
    { name: "my--arg", message: 'Invalid argument name "my--arg"' },
    { name: "-arg", message: 'Invalid argument name "-arg"' },
    { name: "", message: 'Invalid argument name "". Names must be non-empty.' },
  ])('defineCommand rejects invalid arg name "$name"', ({ name, message }) => {
    expect(() =>
      defineCommand({
        args: [{ name, type: "string" }],
        async run() {},
      }),
    ).toThrow(message);
  });

  test.each([
    { name: "my option", type: "string" as const, message: 'Invalid option name "my option"' },
    {
      name: "",
      type: "string" as const,
      message: 'Invalid option name "". Names must be non-empty.',
    },
    { name: "-verbose", type: "boolean" as const, message: 'Invalid option name "-verbose"' },
  ])('defineCommand rejects invalid option name "$name"', ({ name, type, message }) => {
    expect(() =>
      defineCommand({
        options: [{ name, type }],
        async run() {},
      }),
    ).toThrow(message);
  });
});

describe("camelCase alias and short name validation", () => {
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

  test.each([
    {
      names: ["foo-bar", "fooBar"] as const,
      message: 'Duplicate option name "fooBar".',
    },
    {
      names: ["fooBar", "foo-bar"] as const,
      message: 'Option "foo-bar" conflicts with "fooBar" (same camelCase alias).',
    },
  ])("defineCommand rejects options whose camelCase aliases collide", ({ names, message }) => {
    expect(() => {
      // @ts-expect-error camelCase alias collision
      defineCommand({
        options: [
          { name: names[0], type: "string" },
          { name: names[1], type: "string" },
        ],
        async run() {},
      });
    }).toThrow(message);
  });

  test.each([
    { short: "vv", message: 'Invalid short name "vv" for option "verbose"' },
    { short: "1", message: 'Invalid short name "1" for option "verbose"' },
  ])('defineCommand rejects invalid short name "$short"', ({ short, message }) => {
    expect(() =>
      defineCommand({
        // @ts-expect-error invalid short name
        options: [{ name: "verbose", type: "boolean", short }],
        async run() {},
      }),
    ).toThrow(message);
  });
});

describe("uniqueness validation", () => {
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
});

describe("reserved name validation", () => {
  test.each([
    {
      label: "version option",
      define: () =>
        defineCommand({
          options: [{ name: "version", type: "string" }],
          async run() {},
        }),
    },
    {
      label: "json option when json mode is not enabled",
      define: () =>
        defineCommand({
          options: [{ name: "json", type: "boolean" }],
          async run() {},
        }),
    },
    {
      label: "-V short name",
      define: () =>
        defineCommand({
          options: [{ name: "verbose", type: "boolean", short: "V" }],
          async run() {},
        }),
    },
    {
      label: "non-reserved short names",
      define: () =>
        defineCommand({
          options: [{ name: "verbose", type: "boolean", short: "v" }],
          async run() {},
        }),
    },
  ])("defineCommand allows $label", ({ define }) => {
    expect(() => define()).not.toThrow();
  });

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
});

describe("alias validation", () => {
  test("defineCommand accepts valid command aliases", () => {
    expect(() =>
      defineCommand({
        aliases: ["create", "new-project", "v2"],
        async run() {},
      }),
    ).not.toThrow();
  });

  test("defineCommand rejects invalid command aliases", () => {
    expect(() =>
      defineCommand({
        aliases: ["CreateProject"],
        async run() {},
      }),
    ).toThrow(
      'Invalid command alias "CreateProject". Aliases must be lowercase kebab-case (letters, digits, and internal hyphens).',
    );
  });

  test("defineCommand rejects duplicate command aliases", () => {
    expect(() =>
      defineCommand({
        aliases: ["create", "create"],
        async run() {},
      }),
    ).toThrow('Duplicate command alias "create".');
  });
});

describe("runtime validation for widened inputs", () => {
  test.each([
    {
      label: "camelCase-colliding option names",
      define: () => {
        const fields: readonly CommandOptionField[] = [
          { name: "foo-bar", type: "string" },
          { name: "fooBar", type: "string" },
        ];
        return defineCommand({ options: fields, run() {} });
      },
      message: /Duplicate option name/,
    },
    {
      label: "duplicate arg names",
      define: () => {
        const fields: readonly CommandArgField[] = [
          { name: "input", type: "string" },
          { name: "input", type: "string" },
        ];
        return defineCommand({ args: fields, run() {} });
      },
      message: /Duplicate/,
    },
    {
      label: "duplicate option short names",
      define: () => {
        const fields: readonly CommandOptionField[] = [
          { name: "verbose", type: "boolean", short: "v" },
          { name: "version", type: "boolean", short: "v" },
        ];
        return defineCommand({ options: fields, run() {} });
      },
      message: /Duplicate short/,
    },
    {
      label: "invalid option names",
      define: () => {
        const fields: readonly CommandOptionField[] = [{ name: "-bad", type: "string" }];
        return defineCommand({ options: fields, run() {} });
      },
      message: /Invalid option name/,
    },
    {
      label: "empty arg names",
      define: () => {
        const fields: readonly CommandArgField[] = [{ name: "", type: "string" }];
        return defineCommand({ args: fields, run() {} });
      },
      message: /Invalid argument name/,
    },
    {
      label: "reserved option names",
      define: () => {
        const fields: readonly CommandOptionField[] = [{ name: "help", type: "boolean" }];
        return defineCommand({ options: fields, run() {} });
      },
      message: /reserved by the framework/,
    },
    {
      label: "reserved option short names",
      define: () => {
        const fields: readonly CommandOptionField[] = [
          { name: "header", type: "string", short: "h" },
        ];
        return defineCommand({ options: fields, run() {} });
      },
      message: /reserved by the framework/,
    },
    {
      label: "json option names in json mode",
      define: () => {
        const fields: readonly CommandOptionField[] = [{ name: "json", type: "boolean" }];
        return defineCommand({ json: true, options: fields, run: () => ({}) });
      },
      message: /reserved by the framework/,
    },
    {
      label: "boolean primitive multiple options",
      define: () => {
        const fields: readonly CommandOptionField[] = [
          { name: "force", type: "boolean", multiple: true } as unknown as CommandOptionField,
        ];
        return defineCommand({ options: fields, run() {} });
      },
      message: /Boolean option "force" cannot use multiple: true/,
    },
    {
      label: "schema flag multiple options",
      define: () => {
        const fields: readonly CommandOptionField[] = [
          {
            name: "force",
            schema: z.boolean(),
            flag: true,
            multiple: true,
          } as unknown as CommandOptionField,
        ];
        return defineCommand({ options: fields, run() {} });
      },
      message: /Schema flag option "force" cannot use multiple: true/,
    },
  ])("rejects $label at runtime", ({ define, message }) => {
    expect(() => define()).toThrow(message);
  });

  test("prefers invalid argument names over later camelCase-collision errors", () => {
    const fields: readonly CommandArgField[] = [
      { name: "-arg", type: "string" },
      { name: "Arg", type: "string" },
    ];

    expect(() => defineCommand({ args: fields, run() {} })).toThrow(/Invalid argument name/);
  });

  test("prefers invalid option names over later camelCase-collision errors", () => {
    const fields: readonly CommandOptionField[] = [
      { name: "-verbose", type: "string" },
      { name: "Verbose", type: "string" },
    ];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/Invalid option name/);
  });

  test("prefers reserved option names over later negation-collision errors", () => {
    const fields: readonly CommandOptionField[] = [
      { name: "help", type: "boolean", default: true },
      { name: "no-help", type: "string" },
    ];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/reserved by the framework/);
  });

  test("prefers reserved short names over duplicate short-name errors", () => {
    const fields: readonly CommandOptionField[] = [
      { name: "header", type: "string", short: "h" },
      { name: "hello", type: "boolean", short: "h" },
    ];

    expect(() => defineCommand({ options: fields, run() {} })).toThrow(/reserved by the framework/);
  });

  test.each([
    {
      label: "widened member names in option tuples",
      define: () => {
        const dynamicName: string = "alpha";
        return defineCommand({
          options: [
            { name: dynamicName, type: "string" },
            { name: "beta", type: "string" },
          ],
          async run() {},
        });
      },
    },
    {
      label: "widened short names in option tuples",
      define: () => {
        const dynamicShort = "a" as SingleLetter;
        return defineCommand({
          options: [
            { name: "alpha", type: "string", short: dynamicShort },
            { name: "beta", type: "string", short: "b" },
          ],
          async run() {},
        });
      },
    },
  ])("does not report false positives for $label", ({ define }) => {
    expect(() => define()).not.toThrow();
  });
});

describe("defined command branding", () => {
  test("isDefinedCommand returns true for commands created by defineCommand", () => {
    const command = defineCommand({
      async run() {},
    });

    expect(isDefinedCommand(command)).toBe(true);
  });

  test("isDefinedCommand returns false for non-command values", () => {
    expect(isDefinedCommand({ run() {} })).toBe(false);
    expect(isDefinedCommand(null)).toBe(false);
    expect(isDefinedCommand("command")).toBe(false);
  });
});
