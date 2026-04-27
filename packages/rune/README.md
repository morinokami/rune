# Rune

Rune is an agent-native CLI framework designed for the agentic era. It is built around two principles:

- Rune must be a CLI framework that is easy to understand not only for humans, but also for agents
- CLIs built with Rune must likewise be easy to work with for both humans and agents

Key features:

- File-based command routing — directory structure maps directly to the CLI command tree
- Type-safe command definitions with full inference from `defineCommand()`
- Global options via `defineConfig({ options })`
- [Standard Schema](https://standardschema.dev/) support for options and args (Zod, Valibot, ArkType, ...)
- Built-in `--json` mode that turns the same command into a machine-readable API, auto-enabled under AI agents
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
npm create rune-app@latest my-cli
cd my-cli
npm install
```

This generates the following structure:

```
my-cli/
  src/
    commands/
      hello.ts
      hello.test.ts
      text/
        _group.ts
        count.ts
        count.test.ts
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

Files and directories whose command name starts with `_` are ignored by routing, so command-specific helpers can live next to the command that uses them. Colocated test files ending in `.test.ts` or `.spec.ts` are also ignored:

```
src/commands/
  deploy.ts          -> my-cli deploy
  deploy.test.ts     -> ignored
  _deploy-logic.ts   -> ignored
  project/
    _group.ts        -> group metadata
    _schema.ts       -> ignored
    create.ts        -> my-cli project create
```

`_group.ts` is a reserved metadata file, not a private helper. The `_` prefix keeps Rune-owned metadata and private implementation files out of the public command namespace.

Each command file exports a default `defineCommand()` call:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Greet someone",
  options: [{ name: "loud", type: "boolean", short: "l" }],
  args: [{ name: "name", type: "string", required: true }],
  run({ options, args, output }) {
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

## Options and Arguments

`options` are `--name` flags; `args` are positional. Required `args` must come before optional ones.

Global options can be defined once in `rune.config.ts` and are available to every executable command:

```ts
import { defineConfig } from "@rune-cli/rune";

export default defineConfig({
  options: [{ name: "profile", type: "string", default: "prod" }],
});
```

Use them after the resolved command path:

```sh
my-cli deploy --profile dev
```

### Primitive Fields

| Property      | Description                                              |
| ------------- | -------------------------------------------------------- |
| `name`        | Identifier used as the key in `ctx.args` / `ctx.options` |
| `type`        | `"string"`, `"number"`, `"boolean"`, or `"enum"`         |
| `required`    | Whether the field must be provided                       |
| `default`     | Default value; shown in `--help` output                  |
| `description` | Help text                                                |
| `short`       | Single-letter alias (options only, e.g. `"f"` → `-f`)    |
| `multiple`    | Allow an option to be repeated and parsed as an array    |

```ts
defineCommand({
  options: [
    { name: "retries", type: "number", default: 3, description: "Retry count" },
    { name: "verbose", type: "boolean", short: "v" },
  ],
  args: [{ name: "name", type: "string", required: true }],
  run({ options, args }) {
    // options.retries: number, options.verbose: boolean, args.name: string
  },
});
```

### Enum Fields

Use `type: "enum"` with a `values` list to accept only a fixed set of string or number choices. The allowed-values union is inferred automatically and rendered in `--help`.

```ts
defineCommand({
  options: [{ name: "mode", type: "enum", values: ["dev", "prod"], default: "dev" }],
  args: [{ name: "target", type: "enum", values: ["web", "node"], required: true }],
  run({ options, args }) {
    // options.mode: "dev" | "prod", args.target: "web" | "node"
  },
});
```

String values must match `/^[A-Za-z0-9_.-]+$/`. For free-form strings or runtime validation (regex, uniqueness, transformation), use a `type: "string"` field or a schema field.

### Repeatable Options

Set `multiple: true` on a string, number, enum, or schema value option to allow repeated flags. Values are parsed in declaration order and exposed as an array. If omitted, the option is optional unless you provide an array `default` such as `[]` or set `required: true`.

```ts
defineCommand({
  options: [
    { name: "tag", type: "string", multiple: true, default: [] },
    { name: "level", type: "number", multiple: true },
  ],
  run({ options }) {
    // options.tag: string[], options.level?: number[]
  },
});
```

Primitive boolean options and schema `flag: true` options cannot be repeatable.

### Standard Schema Fields

Use `schema` instead of `type` to plug in any [Standard Schema](https://standardschema.dev/)-compatible library (Zod, Valibot, ArkType, ...). Rune calls validators through the Standard Schema contract, so there is no lock-in to a specific library.

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  description: "Fetch a resource by id",
  options: [{ name: "retries", schema: z.coerce.number().int().min(0).max(10), defaultLabel: "3" }],
  args: [{ name: "id", schema: z.uuid(), typeLabel: "uuid", description: "Resource id" }],
  run({ options, args }) {
    // options.retries: number, args.id: string
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

Under AI agents (Claude Code, Cursor, Codex, etc.), `json: true` commands auto-enable JSON mode even without `--json`, so a single command serves both humans and agents seamlessly. Detection only triggers on known agent environment variables — CI jobs and shell pipes continue to produce human-readable output unless `--json` is passed explicitly.

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

`--help` output is generated from `description`, `options`, `args`, `examples`, and the surrounding command tree. Override per command with `defineCommand({ help })`, or configure project-wide help and CLI metadata via `rune.config.ts`:

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  name: "my-cli",
  version: "1.0.0",
  help(data) {
    return `${data.cliName}\n\n${renderDefaultHelp(data)}\n\nDocs: https://example.com`;
  },
});
```

`name` and `version` affect help output, `--version`, and JSON help metadata. When omitted, Rune derives them from `package.json`.

Pass `--json` with `--help` to inspect the same help data as structured JSON. This works even for commands that do not enable runtime JSON output with `json: true`:

```sh
my-cli deploy --help --json
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
| `defineConfig(def)`   | Define project-wide CLI metadata and help configuration.                |
| `CommandError`        | Structured error class for command failures.                            |
| `renderDefaultHelp()` | Render the default help output as a string; useful from custom `help`.  |
| `runCommand()`        | (from `@rune-cli/rune/test`) Execute a command in-process for testing.  |

## Documentation

Full documentation is available at the [Rune docs site](https://rune-cli.org/).

## License

Published under the [MIT License](https://github.com/morinokami/rune/blob/main/LICENSE).
