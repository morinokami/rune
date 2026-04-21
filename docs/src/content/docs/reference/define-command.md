---
title: defineCommand()
description: API reference for the defineCommand function.
---

`defineCommand()` creates a CLI command. The returned object must be the file's default export.

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a new project",
  args: [{ name: "name", type: "string", required: true }],
  options: [{ name: "force", type: "boolean", short: "f" }],
  run({ args, options }) {
    // ...
  },
});
```

## Properties

### `description`

- **Type:** `string`
- **Optional**

A one-line summary shown in `--help` output.

### `args`

- **Type:** `CommandArgField[]`
- **Optional**

Positional arguments declared in the order they appear on the command line. Required arguments must come before optional ones.

Each entry is a **primitive field**, an **enum field**, or a **schema field**. A field must use exactly one of `type` with a primitive type, `type: "enum"` with `values`, or `schema` — never a mix.

#### Primitive field

##### `name`

- **Type:** `string`
- **Required**

Identifier used as the key in `ctx.args`.

##### `type`

- **Type:** `"string" | "number" | "boolean"`
- **Required**

The type Rune parses the raw token into.

##### `required`

- **Type:** `boolean`
- **Default:** `false`

When `true`, the argument must be provided.

##### `default`

- **Type:** Matches `type`
- **Optional**

Value used when the user omits the argument. Primitive defaults are shown in `--help`.

##### `description`

- **Type:** `string`
- **Optional**

Help text shown in `--help` output.

#### Enum field

##### `name`

- **Type:** `string`
- **Required**

Identifier used as the key in `ctx.args`.

##### `type`

- **Type:** `"enum"`
- **Required**

##### `values`

- **Type:** `readonly (string | number)[]`
- **Required**

Allowed values. The raw CLI token is matched against each entry using strict string comparison (`String(value) === rawToken`), so `values: [1, 2]` accepts `"1"` or `"2"` but not `"007"` or `"1.0"`. String values must match `/^[A-Za-z0-9_.-]+$/` (letters, digits, `_`, `.`, `-`) — values that contain spaces or other special characters are rejected at definition time. Empty strings, `NaN`, `Infinity`, and duplicates (after string conversion) are rejected as well.

##### `required`

- **Type:** `boolean`
- **Default:** `false`

When `true`, the field must be provided by the user.

##### `default`

- **Type:** One of `values`
- **Optional**

Value used when the user omits the field. Must be listed in `values`.

##### `description`

- **Type:** `string`
- **Optional**

Help text shown in `--help` output. The allowed values are rendered alongside the name as `<a|b|c>`.

#### Schema field

##### `name`

- **Type:** `string`
- **Required**

Identifier used as the key in `ctx.args`.

##### `schema`

- **Type:** `StandardSchemaV1`
- **Required**

A [Standard Schema](https://standardschema.dev) object (e.g. Zod, Valibot) for validation and transformation. Required/optional semantics are derived from the schema.

##### `typeLabel`

- **Type:** `string`
- **Optional**

Display-only type hint rendered as `<typeLabel>` in `--help` output (e.g. `"uuid"`, `"number"`). Has no effect on validation or type inference. Use this when the schema's runtime value shape is not otherwise communicated to the reader.

##### `defaultLabel`

- **Type:** `string`
- **Optional**

Display-only default-value label rendered as `(default: defaultLabel)` in `--help` output. Has no effect on required/optional handling, which is still derived from the schema itself. Keep this in sync with the schema's actual default if one is set.

##### `description`

- **Type:** `string`
- **Optional**

Help text shown in `--help` output.

### `options`

- **Type:** `CommandOptionField[]`
- **Optional**

Options declared as `--name` flags.

Each entry is a **primitive field**, an **enum field**, or a **schema field**, with the same base properties as `args` plus the following additional properties. Primitive defaults are shown in `--help`, except for boolean options. Primitive boolean options always default to `false`, even when `required` and `default` are omitted. When a primitive boolean option sets `default: true`, a `--no-<name>` flag is automatically generated so users can override the default. See [Negatable boolean options](#negatable-boolean-options) for details.

The option name `"help"` is reserved by the framework and cannot be used. When `json: true` is set, the name `"json"` is also reserved because the framework manages the built-in `--json` flag.

#### `short`

- **Type:** Single ASCII letter
- **Optional**

Single-character shorthand (e.g. `"f"` for `--force` -> `-f`). Must be unique across all options. The short name `"h"` is reserved for the built-in `--help` flag and cannot be used.

#### `multiple`

- **Type:** `true`
- **Optional** (options only)

When set, the option may be provided more than once. Primitive `"string"` and `"number"` options, as well as enum options, are parsed into arrays in declaration order:

```ts
options: [
  { name: "tag", type: "string", multiple: true, default: [] },
  { name: "level", type: "number", multiple: true },
];
```

Here `ctx.options.tag` is `string[]`, while `ctx.options.level` is `number[] | undefined` unless the option is required or has an array default. Enum options follow the same rule, with each item restricted to `values`.

For schema-backed options, Rune passes the collected raw string values to the schema as an array, so use an array-shaped schema:

```ts
options: [{ name: "tag", schema: z.array(z.string()).default([]), multiple: true }];
```

Primitive boolean options and schema `flag: true` options cannot use `multiple: true`.

#### `flag`

- **Type:** `true`
- **Optional** (schema fields only)

When set, the option is parsed as a boolean flag with no value. The schema receives `true` when the flag is present, `undefined` when absent.

### `aliases`

- **Type:** `readonly string[]`
- **Optional**

Alternative names for this command. Each alias is an additional path segment that routes to this command. Aliases must follow kebab-case rules (lowercase letters, digits, and internal hyphens). The root command cannot have aliases.

### `examples`

- **Type:** `readonly string[]`
- **Optional**

Usage examples shown in the `Examples:` section of `--help` output. Each entry is a string representing a full command invocation.

### `json`

- **Type:** `boolean`
- **Default:** `false`

When `true`, the framework accepts a built-in `--json` flag. In JSON mode, the return value of `run()` becomes structured JSON output, and `output.log()` calls are suppressed.

### `help`

- **Type:** `(data: CommandHelpData) => string`
- **Optional**

Custom help renderer for this command. When provided, Rune calls this function instead of the global or default renderer for this command's `--help` output.

The `data` argument is the structured `CommandHelpData` for the matched command.

```ts
import { defineCommand, renderDefaultHelp } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy to production",
  help(data) {
    return `Deploy Command\n\n${renderDefaultHelp(data)}`;
  },
  async run() {
    // ...
  },
});
```

If `help()` throws, Rune falls back to the default help renderer and writes a warning to stderr.

### `run`

- **Type:** `(ctx: CommandContext) => void | Promise<void>` (when `json` is `false` or omitted) or `(ctx: CommandContext) => TCommandData | Promise<TCommandData>` (when `json` is `true`)
- **Required**

The function executed when the command is invoked. When `json` is `true`, the return value becomes part of the command's API, is serialized as JSON output when the user passes `--json`, and is preserved in `runCommand().data`.

## CommandContext

The `run` function receives a `CommandContext` object with the following properties:

### `args`

- **Type:** `object`

Parsed positional argument values, keyed by field name.

### `options`

- **Type:** `object`

Parsed option values, keyed by field name.

### `cwd`

- **Type:** `string`

Working directory the CLI was invoked from.

### `rawArgs`

- **Type:** `readonly string[]`

Unparsed argv tokens before Rune splits them into `args` and `options`. Useful for forwarding to child processes.

### `output`

- **Type:** `CommandOutput`

Framework output API. Use `output.log()` for stdout and `output.error()` for stderr.

## Kebab-case field names

Fields with hyphenated names (e.g. `dry-run`) are accessible by both the original name and its camelCase equivalent (`dryRun`) on the `ctx.args` and `ctx.options` objects. This is enforced at the type level.

## Negatable boolean options

When a primitive boolean option has `default: true`, Rune automatically generates a `--no-<name>` flag that sets the value to `false`.

```ts
export default defineCommand({
  options: [{ name: "color", type: "boolean", default: true }],
  run({ options }) {
    console.log(options.color); // true by default, false with --no-color
  },
});
```

The `--help` output shows both forms:

```
Options:
  --color, --no-color
  -h, --help           Show help
```

`--<name>` and `--no-<name>` cannot be used together — doing so produces an error. Defining a separate option whose name matches the generated negation (e.g. an option named `no-color` alongside a negatable `color` option) is also rejected at definition time.

Other primitive defaults are shown directly in help output.

This feature only applies to primitive boolean options with an explicit `default: true`. Schema-backed fields are not affected because their default values cannot be inspected at definition time.
