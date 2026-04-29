---
title: Commands
description: Learn how to define commands in Rune.
---

## Defining commands

As described in the [Routing](/guides/routing/) guide, commands in Rune are defined by `index.ts` or other routable `.ts` files inside `src/commands`. Each command file uses the `defineCommand()` function, which takes an object specifying the command's description, arguments, options, `run` function, and more. The returned command object must be the file's default export so that Rune can recognize it as a command.

Here is an example of a greeting command. It defines a flag via `options` and a positional argument via `args`, then implements the command logic in the `run` function:

```ts
// src/commands/index.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Greet someone",
  options: [
    {
      name: "loud",
      type: "boolean",
    },
  ],
  args: [
    {
      name: "name",
      type: "string",
      required: true,
    },
  ],
  run({ options, args, output }) {
    const greeting = `Hello, ${args.name}!`;
    output.log(options.loud ? greeting.toUpperCase() : greeting);
  },
});
```

Running this command produces the following output:

```bash
$ my-cli --help
Greet someone

Usage: my-cli [options] <name>

Options:
  --loud
  -h, --help  Show help

Arguments:
  name <string>

$ my-cli foo
Hello, foo!

$ my-cli foo --loud
HELLO, FOO!
```

Use `output.log()` for normal stdout and `output.error()` for stderr. This keeps command output testable with `runCommand()` and allows Rune to suppress human-readable stdout when a `json: true` command is run with `--json`. For details, see the [JSON output](/guides/json/) guide.

## Command file types

The type of file you place under `src/commands` determines how it is registered as a command.

### `index.ts`

Placing an `index.ts` in a directory makes that directory path an executable command. For example, `src/commands/project/index.ts` becomes `your-cli project`.

`src/commands/index.ts` corresponds to the root command, which runs when the CLI is invoked without any arguments.

For example, this file defines behavior for `your-cli` itself:

```ts
// src/commands/index.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Show the default workspace summary",
  run({ output }) {
    output.log("workspace summary");
  },
});
```

### Other `.ts` files

Any `.ts` file other than `index.ts`, reserved metadata files like `_group.ts`, `_`-prefixed files, and test files becomes a subcommand named after the file. For example, `src/commands/project/create.ts` maps to `your-cli project create`.

This is a convenient way to define subcommands without creating a nested directory, and works well for simple commands that don't need children of their own.

### Colocation

Files and directories whose command name starts with `_` are ignored by routing. Use this for command-specific implementation details that should live next to the command:

```text
src/commands/
  deploy.ts
  _deploy-logic.ts
  deploy/
    index.ts
    _schema.ts
    _internal/
      client.ts
```

Colocated test files ending in `.test.ts` or `.spec.ts` are also ignored:

```text
src/commands/
  deploy.ts
  deploy.test.ts
  project/
    create.ts
    create.spec.ts
```

In the examples above, only `deploy` and `project create` are commands.

## Groups

A directory with subcommands automatically acts as a command group. To add a description, aliases, or other metadata to a group, place a `_group.ts` file in the directory and use the `defineGroup()` function.

```ts
// src/commands/project/_group.ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
```

In this example, running `your-cli project` displays help output that includes the description along with the available subcommands.

`_group.ts` is the reserved file for command group metadata. Because the reserved file name is `_group.ts`, `group.ts` remains available as a regular command file.

`_group.ts` and `index.ts` cannot coexist in the same directory. Use `index.ts` when the directory path itself should be an executable command, and `_group.ts` when it should only serve as a group of subcommands.

### Choosing between `index.ts` and `_group.ts`

Use the directory path as an executable command when it should do work or render command-specific help on its own. Use a group when the directory exists only to organize child commands.

| If you want... | Use |
|---|---|
| `your-cli` to do something when run with no arguments | `src/commands/index.ts` |
| `your-cli project` to execute logic and still have subcommands like `your-cli project create` | `src/commands/project/index.ts` |
| `your-cli project` to exist only as a help/grouping node for `create`, `list`, etc. | `src/commands/project/_group.ts` |
| A simple leaf command with no children, such as `your-cli hello` | `src/commands/hello.ts` or `src/commands/hello/index.ts` |

As a rule of thumb, choose `index.ts` for executable commands and `_group.ts` for help-only parent nodes.

## Full help example

The following layout combines a root command, a help-only group, and two leaf commands:

```text
src/commands/
  index.ts
  project/
    _group.ts
    create.ts
    list.ts
```

Running `your-cli project --help` can produce output like this:

```text
Manage projects

Usage: your-cli project <command>

Subcommands:
  create  Create a project
  list    List projects

Options:
  -h, --help  Show help
```

This is the default shape for help output when a description is present: the description is printed above `Usage:`.

## Enum fields

When a field should accept only one of a fixed set of choices, use `type: "enum"` with a `values` list. Both string and number values are allowed, the union of allowed values is inferred automatically (no `as const` needed), and the allowed values are rendered in `--help`.

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Build the project",
  options: [
    {
      name: "mode",
      type: "enum",
      values: ["dev", "prod"],
      default: "dev",
      description: "Build mode",
    },
  ],
  args: [{
    name: "target",
    type: "enum",
    values: ["web", "node"],
    required: true,
  }],
  run({ options, args, output }) {
    // options.mode is "dev" | "prod"; args.target is "web" | "node"
    output.log(`Building ${args.target} in ${options.mode} mode`);
  },
});
```

CLI tokens are matched against the declared values using strict string comparison, so `values: [1, 2]` accepts `--level 1` but not `--level 01`. Providing a value that is not listed produces a helpful error that echoes the allowed choices.

String values must match `/^[A-Za-z0-9_.-]+$/` (letters, digits, `_`, `.`, `-`) and are rejected at definition time otherwise. If you need free-form strings, use a `type: "string"` field or a schema field instead.

For choices that need runtime validation (regex checks, uniqueness, transformation, etc.), use a [Standard Schema](/guides/standard-schema/) field.

## Repeatable options

Options that accept multiple values can set `multiple: true`. Rune collects repeated flags in the order they appear on the command line:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [
    { name: "tag", type: "string", multiple: true, default: [] },
    { name: "level", type: "number", multiple: true },
  ],
  run({ options, output }) {
    // options.tag is string[]; options.level is number[] | undefined
    output.log(options.tag.join(", "));
  },
});
```

Both `--tag alpha --tag beta` and mixed long/short forms are accepted when the option is repeatable. Repeating the same option without `multiple: true` is an error.

Repeatable options are supported for primitive string/number options, enum options, and schema-backed value options. Primitive boolean options and schema `flag: true` options cannot be repeatable. For schema-backed repeatable options, the schema receives the collected raw string values as an array, so use an array-shaped schema such as `z.array(z.string()).default([])`.

## Environment variable fallback

Scalar options can declare an `env` fallback. Rune uses it only when the option was not provided on the command line:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [
    {
      name: "port",
      type: "number",
      env: "PORT",
      default: 3000,
      description: "Port to listen on",
    },
  ],
  run({ options, output }) {
    output.log(String(options.port));
  },
});
```

The priority is **CLI > env > default**. `--port 4000` wins over `PORT=5000`; if `--port` is omitted, `PORT=5000` is parsed as the option value; if neither exists, Rune uses `default`.

Env values use the same parser and validation rules as CLI values. Invalid env values fail the command instead of falling back to defaults. `env` does not affect type inference, and repeatable options cannot use it.

## Kebab-case field names

When an argument or option name contains hyphens (e.g. `dry-run`), it can be accessed on `ctx.args` or `ctx.options` using either the original name or its camelCase form:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [{ name: "dry-run", type: "boolean" }],
  run({ options }) {
    // both work
    console.log(options["dry-run"]);
    console.log(options.dryRun);
  },
});
```

This mapping is also enforced at the type level, so both forms get full autocompletion.

## Negatable boolean options

When a primitive boolean option has `default: true`, Rune automatically generates a `--no-<name>` flag so users can override the default:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [
    {
      name: "color",
      type: "boolean",
      default: true,
      description: "Colorize output",
    },
  ],
  run({ options }) {
    console.log(options.color);
  },
});
```

```bash
$ my-cli             # options.color -> true (default)
$ my-cli --color     # options.color -> true
$ my-cli --no-color  # options.color -> false
```

The `--help` output shows both forms together:

```
Options:
  --color, --no-color  Colorize output
  -h, --help           Show help
```

Using `--color` and `--no-color` together in the same invocation is an error.

## Aliases

Commands and groups can define aliases as alternative names. When an alias is set, the command can be invoked by either its original name or any of its aliases.

```ts
// src/commands/project/create.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a new project",
  aliases: ["new"],
  run() {
    // ...
  },
});
```

With this definition, both `your-cli project create` and `your-cli project new` run the same command.

Aliases have the following constraints:

- Aliases must not conflict with other commands or aliases at the same level.
- The root command cannot have aliases.
