---
title: Commands
description: Learn how to define commands in Rune.
---

## Defining Commands

As described in the [Routing](/guides/routing/) guide, commands in Rune are defined by `index.ts` or regular `.ts` files inside `src/commands`. Each command file uses the `defineCommand()` function, which takes an object specifying the command's description, arguments, options, `run` function, and more. The returned command object must be the file's default export so that Rune can recognize it as a command.

Here is an example of a greeting command. It defines a positional argument via `args` and a flag via `options`, then implements the command logic in the `run` function:

```ts
// src/commands/index.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Greet someone",
  args: [
    {
      name: "name",
      type: "string",
      required: true,
    },
  ],
  options: [
    {
      name: "loud",
      type: "boolean",
    },
  ],
  run({ args, options, output }) {
    const greeting = `Hello, ${args.name}!`;
    output.log(options.loud ? greeting.toUpperCase() : greeting);
  },
});
```

Running this command produces the following output:

```bash
$ my-cli --help
Usage: my-cli <name> [options]

Description:
  Greet someone

Arguments:
  name <string>

Options:
  --loud
  -h, --help  Show help

$ my-cli foo
Hello, foo!

$ my-cli foo --loud
HELLO, FOO!
```

Use `output.log()` for normal stdout and `output.error()` for stderr. This keeps command output testable with `runCommand()` and allows Rune to suppress human-readable stdout when a `json: true` command is run with `--json`. For details, see the [JSON Output](/guides/json/) guide.

## Command File Types

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

Any `.ts` file other than `index.ts` becomes a subcommand named after the file. For example, `src/commands/project/create.ts` maps to `your-cli project create`.

This is a convenient way to define subcommands without creating a nested directory, and works well for simple commands that don't need children of their own.

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

`_group.ts` and `index.ts` cannot coexist in the same directory. Use `index.ts` when the directory path itself should be an executable command, and `_group.ts` when it should only serve as a group of subcommands.

### Choosing Between `index.ts` and `_group.ts`

Use the directory path as an executable command when it should do work or render command-specific help on its own. Use a group when the directory exists only to organize child commands.

| If you want... | Use |
|---|---|
| `your-cli` to do something when run with no arguments | `src/commands/index.ts` |
| `your-cli project` to execute logic and still have subcommands like `your-cli project create` | `src/commands/project/index.ts` |
| `your-cli project` to exist only as a help/grouping node for `create`, `list`, etc. | `src/commands/project/_group.ts` |
| A simple leaf command with no children, such as `your-cli hello` | `src/commands/hello.ts` or `src/commands/hello/index.ts` |

As a rule of thumb, choose `index.ts` for executable commands and `_group.ts` for help-only parent nodes.

## Full Help Example

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

This is the shape to expect for a group defined with `_group.ts`: the group description is printed above `Usage:` without a `Description:` section header, and only the matched leaf command module is loaded at runtime.

## Kebab-case Field Names

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

## Negatable Boolean Options

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
$ my-cli          # options.color → true (default)
$ my-cli --color     # options.color → true
$ my-cli --no-color  # options.color → false
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
