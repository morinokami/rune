# Command Definition Reference

## Import

```ts
import { defineCommand, defineGroup, CommandError } from "@rune-cli/rune";
```

## defineCommand()

Creates a CLI command. The returned object must be the file's default export.

```ts
export default defineCommand({
  description: "Greet someone",
  args: [{ name: "name", type: "string", required: true }],
  options: [{ name: "loud", type: "boolean", short: "l" }],
  run({ args, options, output }) {
    const greeting = `Hello, ${args.name}!`;
    output.log(options.loud ? greeting.toUpperCase() : greeting);
  },
});
```

### Properties

| Property      | Type                                | Required | Description                                                              |
| ------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------ |
| `description` | `string`                            | No       | One-line summary for `--help`                                            |
| `args`        | `CommandArgField[]`                 | No       | Positional arguments, in CLI order                                       |
| `options`     | `CommandOptionField[]`              | No       | Named option flags                                                       |
| `aliases`     | `readonly string[]`                 | No       | Alternative command names (kebab-case). Root command cannot have aliases |
| `examples`    | `readonly string[]`                 | No       | Usage examples for `--help`                                              |
| `json`        | `boolean`                           | No       | Enables `--json` flag (default: `false`)                                 |
| `help`        | `(data: CommandHelpData) => string` | No       | Custom renderer for this command's help output                           |
| `run`         | `(ctx) => void \| Promise<void>`    | Yes      | Command logic. In `json: true` mode it may return structured data        |

### Custom help rendering

Use `help(data)` on a command when only that command needs custom `--help` output:

```ts
import { defineCommand, renderDefaultHelp } from "@rune-cli/rune";

export default defineCommand({
  help(data) {
    return `Custom header\n\n${renderDefaultHelp(data)}`;
  },
  async run() {},
});
```

For project-wide help customization, create `rune.config.ts` at the project root:

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  renderHelp(data) {
    return renderDefaultHelp(data);
  },
});
```

Priority order:

1. `defineCommand({ help })`
2. `defineConfig({ renderHelp })`
3. `renderDefaultHelp()`

### CommandContext (`ctx`)

| Property  | Type                | Description                                            |
| --------- | ------------------- | ------------------------------------------------------ |
| `args`    | `object`            | Parsed positional argument values                      |
| `options` | `object`            | Parsed option values                                   |
| `cwd`     | `string`            | Working directory                                      |
| `rawArgs` | `readonly string[]` | Original unparsed argv tokens                          |
| `output`  | `CommandOutput`     | `output.log()` for stdout, `output.error()` for stderr |

Always use `output.log()` instead of `console.log()`. This allows:

- Capture in tests via `runCommand()`
- Automatic suppression in `--json` mode so stdout stays machine-readable

## Field types

A field uses either `type` (primitive) or `schema` (Standard Schema), never both.

### Primitive fields

```ts
// Args
{ name: "target", type: "string", required: true, description: "Deploy target" }
{ name: "count", type: "number", default: 1 }

// Options (same base properties, plus `short`)
{ name: "output", type: "string", short: "o" }
{ name: "force", type: "boolean", short: "f" }
```

Primitive types: `"string"` | `"number"` | `"boolean"`

- `required: true` makes the field mandatory
- `default` provides a fallback value and makes the field always present in `ctx`
- Primitive defaults are shown in `--help`, except for boolean options
- Primitive boolean options default to `false` even without an explicit `default`
- `short` (options only): single ASCII letter for shorthand (e.g. `-f`). The short name `"h"` is reserved for `--help`

### Schema fields

Use any [Standard Schema](https://standardschema.dev) object (Zod, Valibot, etc.) for validation and transformation:

```ts
import { z } from "zod";

export default defineCommand({
  args: [
    { name: "id", schema: z.uuid() },
    { name: "mode", schema: z.string().optional() },
  ],
  options: [
    { name: "port", schema: z.coerce.number().int().positive() },
    { name: "force", schema: z.boolean(), flag: true },
  ],
  async run(ctx) {
    // ctx.args.id — validated UUID string
    // ctx.options.port — validated positive integer
    // ctx.options.force — boolean flag
  },
});
```

- `flag: true` (schema options only): parsed as a boolean flag with no value. The schema receives `true` when the flag is present, `undefined` when absent.
- Required/optional/default semantics come from the schema itself.
- Validation uses the Standard Schema contract (`schema["~standard"].validate(value)`). Do not call library-specific APIs such as Zod `.parse()`.
- `typeLabel` / `defaultLabel` (schema fields only, display-only): shown in `--help` as `<typeLabel>` and `(default: defaultLabel)`. No effect on validation or type inference. Use when the schema's shape or default is not otherwise discoverable from the help output.

### Argument ordering

Required arguments must come before optional ones. Enforced at both the type level and runtime:

```ts
// Type error — required after optional
defineCommand({
  args: [
    { name: "source", type: "string" },
    { name: "target", type: "string", required: true },
  ],
  run() {},
});
```

## Kebab-case field names

Hyphenated names create camelCase aliases. Both forms are accessible with full type support:

```ts
defineCommand({
  options: [{ name: "dry-run", type: "boolean" }],
  run({ options }) {
    options["dry-run"]; // works
    options.dryRun; // works — same value
  },
});
```

Both `--dry-run` and `--dryRun` work on the command line.

## Negatable boolean options

When a primitive boolean option has `default: true`, Rune auto-generates `--no-<name>`:

```ts
defineCommand({
  options: [{ name: "color", type: "boolean", default: true }],
  run({ options }) {
    // my-cli             → options.color = true
    // my-cli --color     → options.color = true
    // my-cli --no-color  → options.color = false
  },
});
```

- Only primitive boolean options with `default: true` get a negation flag
- Using `--color` and `--no-color` together is an error
- Defining a separate `no-color` option alongside a negatable `color` is rejected at definition time
- Schema-backed fields are not affected (defaults cannot be inspected at definition time)

## JSON mode

Set `json: true` to enable machine-readable output:

```ts
export default defineCommand({
  json: true,
  run({ output }) {
    output.log("visible without --json, suppressed with --json");
    return { items: [1, 2, 3] };
  },
});
```

- **With `--json`**: `output.log()` suppressed, return value printed as formatted JSON to stdout
- **Without `--json`**: `output.log()` works normally, return value is not printed
- `output.error()` always writes to stderr regardless of mode
- `--json` is only recognized before the `--` terminator
- Return value must be serializable by `JSON.stringify()`
- If `run()` returns `undefined`, the JSON output is `null`

Error output in JSON mode:

```json
{
  "error": {
    "kind": "config/not-found",
    "message": "Config file was not found",
    "hint": "Create rune.config.ts"
  }
}
```

## File-based routing

```
src/commands/
├── index.ts              → root command (my-cli)
├── hello.ts              → my-cli hello
├── project/
│   ├── index.ts          → my-cli project (executable, can have subcommands)
│   ├── create.ts         → my-cli project create
│   └── list.ts           → my-cli project list
└── user/
    ├── _group.ts         → my-cli user (help-only group)
    └── delete.ts         → my-cli user delete
```

Rules:

- `index.ts` in a directory makes the directory path an executable command
- `_group.ts` in a directory makes it a help-only group (not executable)
- `index.ts` and `_group.ts` cannot coexist in the same directory
- Regular `.ts` files become subcommands named after the file
- A file and a directory with the same name cannot coexist at the same level
- Only the matched leaf command module is loaded at runtime

### Choosing between `index.ts` and `_group.ts`

| If you want...                                               | Use                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `my-cli` to do something when run with no arguments          | `src/commands/index.ts`                                  |
| `my-cli project` to execute logic and still have subcommands | `src/commands/project/index.ts`                          |
| `my-cli project` to exist only as a help/grouping node       | `src/commands/project/_group.ts`                         |
| A simple leaf command with no children                       | `src/commands/hello.ts` or `src/commands/hello/index.ts` |

## defineGroup()

Adds metadata to a non-executable command group. Place in `_group.ts`:

```ts
// src/commands/project/_group.ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
  aliases: ["proj"],
  examples: ["my-cli project create my-app"],
});
```

| Property      | Type                | Required | Description                                                    |
| ------------- | ------------------- | -------- | -------------------------------------------------------------- |
| `description` | `string`            | Yes      | Summary shown in `--help`                                      |
| `aliases`     | `readonly string[]` | No       | Alternative names (kebab-case). Root group cannot have aliases |
| `examples`    | `readonly string[]` | No       | Usage examples for `--help`                                    |

## CommandError

Throw for structured error reporting:

```ts
import { defineCommand, CommandError } from "@rune-cli/rune";

export default defineCommand({
  args: [{ name: "id", type: "string", required: true }],
  run({ args }) {
    throw new CommandError({
      kind: "not-found",
      message: `Project "${args.id}" not found`,
      hint: "Run 'my-cli project list' to see available projects",
      details: { id: args.id },
      exitCode: 2,
    });
  },
});
```

| Property   | Type        | Required | Description                                                                   |
| ---------- | ----------- | -------- | ----------------------------------------------------------------------------- |
| `kind`     | `string`    | Yes      | Error category for programmatic handling (e.g. `"not-found"`, `"validation"`) |
| `message`  | `string`    | Yes      | Human-readable error message                                                  |
| `hint`     | `string`    | No       | Suggestion for resolution                                                     |
| `details`  | `JsonValue` | No       | Structured data included in JSON output                                       |
| `exitCode` | `number`    | No       | Process exit code (default: `1`)                                              |
| `cause`    | `unknown`   | No       | Underlying error                                                              |

Unhandled non-CommandError exceptions are wrapped with `kind: "rune/unexpected"`.

## Gotchas

- **`output.log()` not `console.log()`**: `console.log()` bypasses the framework — it cannot be captured in tests and corrupts JSON output in `--json` mode.
- **Option value syntax**: both `--name value` and `--name=value` work. `--` terminates option parsing.
- **Duplicate options are errors**: `--name foo --name bar` or mixing long and short forms for the same option both fail.
- **Boolean options without `default: true` have no `--no-*` form**: `--no-force` is an error unless `force` has `default: true`.
- **Schema validation contract**: use `schema["~standard"].validate(value)`, not library-specific `.parse()` or `.safeParse()`.
- **Hyphenated arg names**: must follow the same rules as option names — start with a letter, single internal hyphens only.
- **Field name collisions**: a kebab-case name and its camelCase equivalent cannot coexist (e.g. `dry-run` and `dryRun` in the same command).
- **Reserved names**: the option name `"help"` and short name `"h"` are reserved by the framework. When `json: true`, the option name `"json"` is also reserved.
