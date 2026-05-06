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
  options: [{ name: "profile", type: "string", default: "prod" }],
  locals(ctx) {
    return { profile: ctx.options.profile };
  },
  hooks: {
    beforeRun(ctx) {
      ctx.output.error(`running ${ctx.command.path.join(" ")}`);
    },
  },
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

### `options`

- **Type:** `CommandOptionField[]`
- **Optional**

Global options that are available to every executable command. They use the same field shape as [`defineCommand({ options })`](/reference/define-command/).

```ts
import { defineConfig } from "@rune-cli/rune";
import { z } from "zod";

export default defineConfig({
  options: [
    { name: "profile", type: "string", env: "APP_PROFILE", default: "prod" },
    { name: "region", schema: z.enum(["ap-northeast-1", "us-east-1"]).optional() },
  ],
});
```

Global options are parsed after Rune resolves the executable command:

```sh
my-cli deploy --profile dev
```

They are shown in executable command help, but not in the help for groups that only route to subcommands. Global options must be optional: `required: true` and schemas that reject `undefined` are not supported.

Global options support the same `env` fallback as command options. CLI values still win over env values, and env values win over defaults.

Run `rune sync` after changing `rune.config.ts` to refresh `.rune/global-options.d.ts` for editor type inference. `rune run` regenerates the same file before execution, and `rune build` regenerates it and validates global options against command options before building.

### `locals`

- **Type:** `(ctx: LocalsFactoryContext) => unknown`
- **Optional**

Project-defined runtime values available to every executable command as `ctx.locals`.

```ts
import { defineConfig } from "@rune-cli/rune";

export default defineConfig({
  options: [{ name: "profile", type: "string", default: "prod" }],
  async locals(ctx) {
    const workspace = await resolveWorkspace(ctx.cwd);

    return {
      workspace,
      api: createApiClient({ profile: ctx.options.profile }),
    };
  },
});
```

Rune creates locals once per executable command invocation after routing and argument parsing succeed, and before `hooks.beforeRun`. Locals are not created for `--help`, `--version`, unknown commands, group help, JSON help, or parse and validation failures.

The locals factory context includes parsed `args`, parsed `options`, `cwd`, `rawArgs`, `output`, command metadata, and `outputMode`. It intentionally does not include `stdin`; hooks and commands can still use `ctx.stdin`.

Hooks and the command receive the same locals object. If the locals factory fails, Rune calls `hooks.onRunError` with `stage: "locals"` and no `ctx.locals` value.

Run `rune sync` after changing `locals` to refresh `.rune/global-locals.d.ts` for editor type inference. `rune run` and `rune build` regenerate it automatically.

### `hooks`

- **Type:** `RuneHooks`
- **Optional**

Project-wide hooks that run around every executable command's `run()` lifecycle.

```ts
import { defineConfig } from "@rune-cli/rune";

export default defineConfig({
  hooks: {
    beforeRun(ctx) {
      ctx.output.error(`running ${ctx.command.path.join(" ")}`);
    },
    afterRun(ctx) {
      ctx.output.error(`completed ${ctx.command.path.join(" ")}`);
    },
    onRunError(ctx) {
      ctx.output.error(`${ctx.stage} failed: ${ctx.error.message}`);
    },
  },
});
```

Hooks run after Rune resolves the matched leaf command and successfully parses its arguments. They do not run for `--help`, `--version`, unknown commands, group help, JSON help, or parse and validation failures.

Hook context includes parsed `args`, parsed `options`, `locals`, `cwd`, `rawArgs`, `output`, `stdin`, command metadata, and `outputMode`. `outputMode` is the effective stdout mode for the invocation: `"text"`, `"json"`, or `"jsonl"`. Hook `options` include global and command options, but do not include the framework-injected `json` flag; use `outputMode` instead.

Prefer `output.error()` for hook diagnostics. `output.log()` writes to stdout for text commands and can change the command's user-facing stdout contract.

`afterRun` receives a `result` snapshot. Text commands receive `{ kind: "text" }`, `json: true` commands receive `{ kind: "json", data }` even when effective JSON mode is off, and `jsonl: true` commands receive `{ kind: "jsonl", records }` after the iterable is consumed.

If `locals`, `beforeRun`, the command `run()`, or `afterRun` fails, Rune calls `onRunError` with `stage` set to `"locals"`, `"beforeRun"`, `"run"`, or `"afterRun"`. During `"locals"` failures, `ctx.locals` is not available because creation failed. If `onRunError` itself fails, Rune reports `rune/hook-failed` and keeps both the original failure and the hook failure in structured details. The `rune/hook-failed` exit code comes from the `onRunError` failure; both nested failures keep their original `exitCode` in details.

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
