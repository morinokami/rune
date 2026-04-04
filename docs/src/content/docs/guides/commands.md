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
  run({ args, options }) {
    const greeting = `Hello, ${args.name}!`;
    console.log(options.loud ? greeting.toUpperCase() : greeting);
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
  --loud <boolean>
  -h, --help  Show help

$ my-cli foo
Hello, foo!

$ my-cli foo --loud
HELLO, FOO!
```

## Command File Types

The type of file you place under `src/commands` determines how it is registered as a command.

### `index.ts`

Placing an `index.ts` in a directory makes that directory path an executable command. For example, `src/commands/project/index.ts` becomes `your-cli project`.

`src/commands/index.ts` corresponds to the root command, which runs when the CLI is invoked without any arguments.

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
