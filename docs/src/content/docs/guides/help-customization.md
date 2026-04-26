---
title: Help Customization
description: Learn how to customize the help output of your CLI.
---

Rune automatically generates help output from a command's `description`, `options`, `args`, and `examples`. If you need more control over the generated help output, you can customize it per command with `defineCommand({ help })`, or apply a project-wide style through `rune.config.ts`.

## Per-command customization

Pass a `help` function to `defineCommand()` to take full control of that command's `--help` output. The function receives a structured `CommandHelpData` object and returns the string to display:

```ts
// src/commands/deploy.ts
import { defineCommand, renderDefaultHelp } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy to production",
  options: [
    { name: "target", type: "string", short: "t", description: "Deploy target" },
  ],
  help(data) {
    return `🚀 Deploy Command\n\n${renderDefaultHelp(data)}`;
  },
  async run({ options }) {
    // ...
  },
});
```

```bash
$ my-cli deploy --help
🚀 Deploy Command

Deploy to production

Usage: my-cli deploy [options]

Options:
  -t, --target <string>  Deploy target
  -h, --help  Show help
```

`CommandHelpData` includes the command name, path segments, options, arguments, and subcommand definitions. You can use these fields to build an entirely custom layout from scratch. See the [`defineCommand()` reference](/reference/define-command/#help) for details.

## Project-level customization

To apply a consistent style across all commands, create a `rune.config.ts` at the project root and define a `help` function with `defineConfig()`:

```ts
// rune.config.ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    return `My CLI v1.0\n\n${renderDefaultHelp(data)}`;
  },
});
```

With this configuration, every command, group, and unknown-command help screen will be prefixed with "My CLI v1.0".

The `data` argument is a `HelpData` union, and you can branch on `data.kind` to handle each case:

```ts
// rune.config.ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    if (data.kind === "unknown") {
      return renderDefaultHelp(data);
    }

    return `My CLI\n\n${renderDefaultHelp(data)}`;
  },
});
```

`data.kind` takes one of three values, allowing you to tailor the output for each type of help:

- `"command"`: help for an individual command
- `"group"`: help for a group with subcommands
- `"unknown"`: help shown when an unrecognized command is entered

See the [`defineConfig()` reference](/reference/define-config/) for details.

## Priority

Help rendering follows a three-level priority chain:

1. `defineCommand({ help })`: command-specific renderer
2. `defineConfig({ help })`: project-wide renderer
3. Rune's built-in default renderer

When a command defines its own `help` function, that function is always used; neither `help` from `rune.config.ts` nor the default renderer is called. For commands without a `help` function, as well as groups and unknown commands, the project-wide `help` is used if defined. If neither is present, Rune falls back to the built-in default renderer.

## Using `renderDefaultHelp`

`renderDefaultHelp` is the same function that powers Rune's built-in default help output, and it can be imported from `@rune-cli/rune`. By calling it inside a custom renderer, you can easily add headers, footers, or other sections around the standard output:

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    const header = "my-tool — A modern build tool\n";
    const footer = "\nDocumentation: https://example.com/docs";
    return `${header}\n${renderDefaultHelp(data)}${footer}\n`;
  },
});
```

You can also skip the default output entirely and build a completely custom format from the fields in `data`.

## Fallback on errors

If a function provided via `defineCommand({ help })` or `defineConfig({ help })` throws an exception, Rune falls back to the default help renderer and prints a warning to stderr. The same fallback also applies when `rune.config.ts` fails to load or does not export a valid `defineConfig()` result. This ensures that `--help` always works, even when a custom renderer or config has a bug.

## JSON help

Pass `--json` together with `--help` to print a structured JSON description instead of text:

```bash
$ my-cli deploy --help --json
{"schemaVersion":1,"kind":"command","cli":{"name":"my-cli"},"command":{"path":["deploy"],"name":"deploy","aliases":[],"examples":[]},"args":[],"options":[{"name":"help","short":"h","source":"framework","type":"boolean","description":"Show help","required":false,"multiple":false,"negatable":false}],"commands":[]}
```

JSON help works for commands, groups, and unknown-command suggestions. It does not require the command to set `json: true`, because it describes the CLI's command structure, options, and arguments rather than the command's runtime output. Custom help renderers from `defineCommand({ help })` and `rune.config.ts` are text-only and are not applied to `--help --json`.
