---
title: defineConfig()
description: API reference for the defineConfig function.
---

`defineConfig()` creates a project-level Rune configuration. Place the returned object in the default export of `rune.config.ts` at the project root.

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  name: "my-cli",
  version: "1.0.0",
  help(data) {
    return `${data.cliName}\n\n${renderDefaultHelp(data)}`;
  },
});
```

## Properties

### `name`

- **Type:** `string`
- **Optional**

CLI display name used in help output, `--version` output, and JSON help metadata.

When omitted, Rune derives the name from `package.json`:

1. the first sorted key from a `bin` object
2. the unscoped package `name`
3. the project directory name

### `version`

- **Type:** `string`
- **Optional**

CLI display version used in help output, `--version` output, and JSON help metadata.

When omitted, Rune uses `package.json`'s `version` field when available. `defineConfig({ version })` does not update `package.json`; keep those values synchronized in your release workflow if you set both.

### `help`

- **Type:** `(data: HelpData) => string`
- **Optional**

Project-wide help renderer used for command help, group help, and unknown-command help.

The `data` argument is a `HelpData` union:

- `GroupHelpData`
- `CommandHelpData`
- `UnknownCommandHelpData`

Use `data.kind` to branch on the current case.

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  name: "my-cli",
  help(data) {
    if (data.kind === "unknown") {
      return renderDefaultHelp(data);
    }

    return `${data.cliName}\n\n${renderDefaultHelp(data)}`;
  },
});
```

## Behavior

### Metadata resolution

`name` and `version` from `defineConfig()` override metadata derived from `package.json`.

If `rune.config.ts` fails to load or does not export a valid `defineConfig()` result, Rune falls back to the `package.json`-derived metadata.

### Priority

Global `help` is used only when the matched command does not define its own `help` function via [`defineCommand()`](/reference/define-command/).

Priority order:

1. `defineCommand({ help })`
2. `defineConfig({ help })`
3. Rune's built-in default help renderer

### Failure handling

If `rune.config.ts` fails to load, does not export a valid `defineConfig()` result, or if `help()` throws, Rune falls back to the default help renderer and writes a warning to stderr.

This keeps `--help` available even when the custom renderer is broken.
