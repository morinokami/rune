# Rune

Rune is an agent-native CLI framework designed for the agentic era. It is built around two principles:

- Rune must be a CLI framework that is easy to understand not only for humans, but also for agents
- CLIs built with Rune must likewise be easy to work with for both humans and agents

Key features:

- File-based command routing — directory structure maps directly to the CLI command tree
- Type-safe command definitions with full inference from `defineCommand()`
- [Standard Schema](https://standardschema.dev/) support for args and options (Zod, Valibot, ArkType, ...)
- Built-in `--json` mode that turns the same command into a machine-readable API
- In-process test utility with no child-process overhead
- Automatic `--help` generation, with per-command and project-wide customization hooks
- Structured errors via `CommandError`, rendered for humans or emitted as JSON
- Official [Agent Skill](https://agentskills.io/home) for AI agents working on Rune projects

> [!IMPORTANT]
> This package is experimental and unstable. Proceed with caution when using it.

## Getting Started

Rune requires Node.js `v22.12.0` or higher.

Scaffold a new project:

```sh
npm create rune-app my-cli
cd my-cli
npm install
```

This generates the following structure:

```
my-cli/
  src/
    commands/
      hello.ts
  package.json
  tsconfig.json
```

Run your CLI directly from source:

```sh
npm run start -- hello
```

Build for production:

```sh
npm run build
```

## Defining Commands

Commands are TypeScript files under `src/commands/`. The directory structure maps directly to the command structure:

```
src/commands/
  index.ts     -> my-cli
  hello.ts     -> my-cli hello
  project/
    index.ts   -> my-cli project
    create.ts  -> my-cli project create
    list.ts    -> my-cli project list
```

Simple leaf commands can be bare files (`hello.ts`), while commands that need subcommands use a directory with `index.ts`. Only the matched leaf command module is loaded at runtime.

Each command file exports a default `defineCommand()` call:

```ts
import { defineCommand } from "@rune-cli/rune";

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

### Command Groups

Place a `_group.ts` file in a command directory to attach metadata (description, aliases, examples) to the group itself:

```ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
```

## Arguments and Options

`args` are positional; `options` are `--name` flags. Required `args` must come before optional ones.

### Primitive Fields

| Property      | Description                                              |
| ------------- | -------------------------------------------------------- |
| `name`        | Identifier used as the key in `ctx.args` / `ctx.options` |
| `type`        | `"string"`, `"number"`, `"boolean"`, or `"enum"`         |
| `required`    | Whether the field must be provided                       |
| `default`     | Default value; shown in `--help` output                  |
| `description` | Help text                                                |
| `short`       | Single-letter alias (options only, e.g. `"f"` → `-f`)    |

```ts
defineCommand({
  args: [{ name: "name", type: "string", required: true }],
  options: [
    { name: "retries", type: "number", default: 3, description: "Retry count" },
    { name: "verbose", type: "boolean", short: "v" },
  ],
  run({ args, options }) {
    // args.name: string, options.retries: number, options.verbose: boolean
  },
});
```

### Enum Fields

Use `type: "enum"` with a `values` list to accept only a fixed set of string or number choices. The allowed-values union is inferred automatically and rendered in `--help`.

```ts
defineCommand({
  args: [{ name: "target", type: "enum", values: ["web", "node"], required: true }],
  options: [{ name: "mode", type: "enum", values: ["dev", "prod"], default: "dev" }],
  run({ args, options }) {
    // args.target: "web" | "node", options.mode: "dev" | "prod"
  },
});
```

String values must match `/^[A-Za-z0-9_.-]+$/`. For free-form strings or runtime validation (regex, uniqueness, transformation), use a `type: "string"` field or a schema field.

### Standard Schema Fields

Use `schema` instead of `type` to plug in any [Standard Schema](https://standardschema.dev/)-compatible library (Zod, Valibot, ArkType, ...). Rune calls validators through the Standard Schema contract, so there is no lock-in to a specific library.

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  description: "Fetch a resource by id",
  args: [{ name: "id", schema: z.uuid(), typeLabel: "uuid", description: "Resource id" }],
  options: [{ name: "retries", schema: z.coerce.number().int().min(0).max(10), defaultLabel: "3" }],
  run({ args, options }) {
    // args.id: string, options.retries: number
  },
});
```

`typeLabel` and `defaultLabel` are display-only hints rendered in `--help`. Required/optional semantics are derived from the schema itself.

### Negatable Boolean Options

A primitive boolean option with `default: true` automatically gets a `--no-<name>` counterpart:

```ts
options: [{ name: "color", type: "boolean", default: true }];
// --color     -> true  (default)
// --no-color  -> false
```

### Kebab-case Field Names

Hyphenated field names (e.g. `dry-run`) are accessible as both `ctx.options["dry-run"]` and `ctx.options.dryRun`, with full type safety.

## JSON Output

Set `json: true` to opt into a built-in `--json` flag. The `run()` return value becomes the structured output, while `output.log()` is suppressed so the stdout stream remains machine-parseable. `output.error()` still writes to stderr.

```ts
export default defineCommand({
  json: true,
  run() {
    return { items: [1, 2, 3] };
  },
});
```

```sh
my-cli         # human-readable text CLI
my-cli --json  # {"items":[1,2,3]}
```

## Structured Errors

`CommandError` carries `kind`, `message`, `hint`, and `details`. Rune formats it for humans in normal mode and emits it as structured JSON under `--json`.

```ts
import { CommandError, defineCommand } from "@rune-cli/rune";

export default defineCommand({
  json: true,
  run() {
    throw new CommandError({
      kind: "not-found",
      message: "Resource not found",
      hint: "Check the id and try again",
    });
  },
});
```

## Help Output

`--help` output is generated from `description`, `args`, `options`, `examples`, and the surrounding command tree. Override per command with `defineCommand({ help })`, or project-wide via `rune.config.ts`:

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    return `${renderDefaultHelp(data)}\n\nDocs: https://example.com`;
  },
});
```

## Testing

Import `runCommand()` from `@rune-cli/rune/test` to exercise commands in-process — argv parsing, type coercion, schema validation, and defaults all run exactly as they do at real invocation.

```ts
import { runCommand } from "@rune-cli/rune/test";
import { expect, test } from "vitest";

import greeting from "../src/commands/index.ts";

test("greets by name", async () => {
  const result = await runCommand(greeting, ["world"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("Hello, world!\n");
});
```

The returned `CommandExecutionResult` exposes `exitCode`, `stdout`, `stderr`, `error`, and `data` (the `run()` return value, for `json: true` commands).

## CLI

The `rune` binary provides two commands:

| Command      | Description                                                                        |
| ------------ | ---------------------------------------------------------------------------------- |
| `rune run`   | Run the project directly from source. Trailing args are forwarded to the user CLI. |
| `rune build` | Build the project into a distributable CLI.                                        |

Both accept `--project <path>` to target a project root other than the current directory.

```sh
rune run hello --loud
rune build --project ./my-app
```

## Agent Skills

Rune ships an official [Agent Skill](https://agentskills.io/home) that gives AI agents on-demand access to Rune-specific conventions — file-based routing, `defineCommand()` usage, testing patterns, and more — so agents can work on Rune projects more accurately and efficiently.

## API

| Export                | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `defineCommand(def)`  | Define a command. The returned value must be the file's default export. |
| `defineGroup(def)`    | Define metadata for a command group in `_group.ts`.                     |
| `defineConfig(def)`   | Define project-wide configuration in `rune.config.ts`.                  |
| `CommandError`        | Structured error class for command failures.                            |
| `renderDefaultHelp()` | Render the default help output as a string; useful from custom `help`.  |
| `runCommand()`        | (from `@rune-cli/rune/test`) Execute a command in-process for testing.  |

## Documentation

Full documentation is available at the [Rune docs site](https://github.com/morinokami/rune).

## License

Published under the [MIT License](https://github.com/morinokami/rune/blob/main/LICENSE).
