---
title: Standard Schema
description: Learn how to use Standard Schema for validation and transformation in Rune commands.
---

In addition to the primitive types (`"string" | "number" | "boolean"`) and the built-in enum type (`type: "enum"` with `values`) declared via the `type` property, Rune's options and arguments accept any [Standard Schema](https://standardschema.dev) compliant object through the `schema` property. This lets you plug in schema libraries like Zod or Valibot to apply validation and transformation that goes well beyond simple type checks.

## Choosing between primitives and schemas

A single field uses exactly one of `type` or `schema`, never both. Which one you pick depends on how much validation and transformation the option or argument needs.

| What you want | Use |
|---|---|
| Simple string, number, or boolean input | `type: "string" \| "number" \| "boolean"` |
| Fixed set of string or number choices | `type: "enum"` with `values` |
| Format validation (UUID, email, etc.) | `schema` |
| Range constraints (min/max, etc.) | `schema` |
| Coercion from string to another type (`z.coerce.number()`, etc.) | `schema` |
| Enumerated values with additional validation or transformation | `schema` |

Primitive and enum types are concise to declare, and `--help` automatically shows the type hint (e.g. `<string>` or `<dev|prod>`) and default value. Schemas give you the full expressive power of the underlying library, but you'll need to supplement the help output with `typeLabel` / `defaultLabel` (covered below).

## Basic usage

### Zod

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  description: "Fetch a resource by id",
  options: [
    {
      name: "retries",
      schema: z.coerce.number().int().min(0).max(10),
      description: "Number of retry attempts",
    },
  ],
  args: [
    {
      name: "id",
      schema: z.uuid(),
      description: "Resource id (UUID)",
    },
  ],
  run({ options, args }) {
    // options.retries is number (validated and coerced to an integer in 0–10)
    // args.id is string (validated as UUID)
  },
});
```

### Valibot

```ts
import { defineCommand } from "@rune-cli/rune";
import * as v from "valibot";

export default defineCommand({
  args: [
    {
      name: "mode",
      schema: v.picklist(["dev", "prod"]),
    },
  ],
  run({ args }) {
    // args.mode is "dev" | "prod"
  },
});
```

The types of values in `ctx.args` and `ctx.options` are inferred automatically from the schema's output type.

## Required, optional, and default values

Primitive fields declare required/optional semantics through the `required` and `default` properties, but schema fields do not. Instead, those semantics are derived from the schema itself.

A field is treated as optional if its schema accepts `undefined`, and required otherwise. For example, `z.string().optional()` and `z.string().default("dev")` both accept `undefined`, so the field is optional; a plain `z.string()` does not, so the field is required.

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    // Required: rejects undefined, so omitting the option is an error
    { name: "id", schema: z.uuid() },

    // Optional: undefined is accepted
    { name: "label", schema: z.string().optional() },

    // Optional with a default: the schema returns "dev" when omitted
    { name: "mode", schema: z.string().default("dev") },
  ],
  run() {
    // ...
  },
});
```

When the schema itself defines a default via `default()`, that value ends up directly in `ctx.options` when the user omits the option.

## Boolean flag options

To treat a schema-backed option as a value-less boolean flag, set `flag: true`. The schema receives `true` when the flag is present and `undefined` when it is absent.

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    {
      name: "force",
      schema: z.boolean().optional(),
      flag: true,
      short: "f",
    },
  ],
  run({ options }) {
    // options.force is boolean | undefined
  },
});
```

`flag: true` is needed because Rune cannot inspect a schema's internal structure to tell whether an option takes a value or is a value-less flag. For primitive fields, `type: "boolean"` provides that hint; schema fields require you to state it explicitly.

Depending on whether `flag: true` is set, the same input parses differently:

```bash
# Without flag: true (treated as a value-taking option)
$ my-cli --force value   # options.force = "value" is passed to the schema
$ my-cli --force         # Error: a value is required

# With flag: true (treated as a value-less flag)
$ my-cli --force         # options.force = true is passed to the schema
$ my-cli --force value   # "value" is treated as the next positional argument
```

Unlike primitive boolean options, schema options with `flag: true` do not get an automatic `--no-<name>` counterpart. If you need a negated form, declare it as a separate option explicitly.

## Help display with `typeLabel` and `defaultLabel`

Standard Schema exposes no API for reading a schema's type or default value from the outside, so `--help` cannot display them automatically for schema fields. To convey that information to the reader, set the display-only `typeLabel` and `defaultLabel` properties on the schema field.

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    {
      name: "port",
      schema: z.coerce.number().int().positive().default(3000),
      typeLabel: "number",
      defaultLabel: "3000",
      description: "Port to listen on",
    },
  ],
  run() {
    // ...
  },
});
```

The resulting `--help` output looks like this:

```
Options:
  --port <number>  Port to listen on (default: 3000)
  -h, --help       Show help
```

Both `typeLabel` and `defaultLabel` are purely cosmetic: they have no effect on validation, type inference, or required/optional resolution. In particular, `defaultLabel` does not supply a default value — that still comes from the schema. Keep the label and the schema in sync so they never drift apart.

## Error behavior

When a schema's validation fails, Rune collects the failure as an argument parse error and prints an error message before the command runs. The message is built by joining the `message` fields of the schema's `issues` with newlines.

```bash
$ my-cli fetch not-a-uuid
Error: Invalid uuid
```

In JSON mode (a command with `json: true` invoked with `--json`), parse errors are emitted as a JSON `error` object on stdout. See the [JSON Output](/guides/json/#error-output) guide for details.
