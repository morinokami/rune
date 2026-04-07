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

Each entry is either a **primitive field** or a **schema field**. A field must use either `type` or `schema`, never both.

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

Value used when the user omits the argument.

##### `description`

- **Type:** `string`
- **Optional**

Help text shown in `--help` output.

#### Schema field

##### `name`

- **Type:** `string`
- **Required**

Identifier used as the key in `ctx.args`.

##### `schema`

- **Type:** `StandardSchemaV1`
- **Required**

A [Standard Schema](https://standardschema.dev) object (e.g. Zod, Valibot) for validation and transformation. Required/optional semantics are derived from the schema.

##### `description`

- **Type:** `string`
- **Optional**

Help text shown in `--help` output.

### `options`

- **Type:** `CommandOptionField[]`
- **Optional**

Options declared as `--name` flags.

Each entry is either a **primitive field** or a **schema field**, with the same base properties as `args` plus the following additional properties. Primitive boolean options always default to `false`, even when `required` and `default` are omitted. When a primitive boolean option sets `default: true`, a `--no-<name>` flag is automatically generated so users can override the default. See [Negatable boolean options](#negatable-boolean-options) for details.

#### `short`

- **Type:** Single ASCII letter
- **Optional**

Single-character shorthand (e.g. `"f"` for `--force` -> `-f`). Must be unique across all options.

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

### `run`

- **Type:** `(ctx: CommandContext) => void | Promise<void>` (when `json` is `false` or omitted) or `(ctx: CommandContext) => unknown` (when `json` is `true`)
- **Required**

The function executed when the command is invoked. When `json` is `true`, the return value becomes part of the command's API and is serialized as JSON output when the user passes `--json`.

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

This feature only applies to primitive boolean options with an explicit `default: true`. Schema-backed fields are not affected because their default values cannot be inspected at definition time.
