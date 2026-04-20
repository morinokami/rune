---
title: defineConfig()
description: API reference for the defineConfig function.
---

`defineConfig()` creates a project-level Rune configuration. Place the returned object in the default export of `rune.config.ts` at the project root.

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    return `My CLI\n\n${renderDefaultHelp(data)}`;
  },
});
```

## Properties

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
  help(data) {
    if (data.kind === "unknown") {
      return renderDefaultHelp(data);
    }

    return `My CLI\n\n${renderDefaultHelp(data)}`;
  },
});
```

## Behavior

### Priority

Global `help` is used only when the matched command does not define its own `help` function via [`defineCommand()`](/reference/define-command/).

Priority order:

1. `defineCommand({ help })`
2. `defineConfig({ help })`
3. Rune's built-in default help renderer

### Failure handling

If `rune.config.ts` fails to load, does not export a valid `defineConfig()` result, or if `help()` throws, Rune falls back to the default help renderer and writes a warning to stderr.

This keeps `--help` available even when the custom renderer is broken.
