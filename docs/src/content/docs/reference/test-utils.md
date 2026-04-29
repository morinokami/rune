---
title: Test Utilities
description: API reference for Rune's testing utilities.
---

Rune provides helpers for testing commands in-process without spawning a child process, exported from `@rune-cli/rune/test`. `runCommand()` is the base helper for running a single command, and `createRunCommand()` builds a runner that bakes in your project config.

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

## `runCommand()`

Exercises a command through Rune's parse-and-execute pipeline. Input is passed as a `string[]` of CLI tokens, so argv parsing, type coercion, schema validation, and default handling all run exactly as they do at real invocation.

```ts
function runCommand(
  command: DefinedCommand,
  argv?: string[],
  context?: RunCommandContext,
): Promise<CommandExecutionResult<TCommandData>>
```

`TCommandData` is inferred from the passed command. For `json: true` commands it matches the `run()` return type; otherwise it is `undefined`.

### Parameters

#### `command`

- **Type:** `DefinedCommand`
- **Required**

A command created by `defineCommand()`.

#### `argv`

- **Type:** `string[]`
- **Default:** `[]`

CLI tokens forwarded to the command.

#### `context`

- **Type:** `RunCommandContext`
- **Default:** `{}`

Optional execution context.

### RunCommandContext

#### `cwd`

- **Type:** `string`
- **Optional**

Working directory value injected into `ctx.cwd`. Does not change `process.cwd()`.

#### `env`

- **Type:** `Record<string, string | undefined>`
- **Optional**

Environment variables used for option `env` fallbacks. This replaces `process.env` for the command under test; it is not merged automatically. When omitted, `runCommand()` uses an empty env map so tests stay isolated from the host environment.

```ts
const command = defineCommand({
  options: [{ name: "port", type: "number", env: "PORT", default: 3000 }],
  run({ options, output }) {
    output.log(String(options.port));
  },
});

test("uses PORT from env", async () => {
  const result = await runCommand(command, [], { env: { PORT: "4000" } });

  expect(result.stdout).toBe("4000\n");
});
```

If you intentionally want to inherit the current process environment, merge it explicitly:

```ts
const result = await runCommand(command, [], {
  env: { ...process.env, PORT: "4000" },
});
```

#### `globalOptions`

- **Type:** `CommandOptionField[]`
- **Optional**

Low-level injection point for global options. Prefer `createRunCommand(config)` for normal tests.

## `createRunCommand()`

Creates a `runCommand()` helper that bakes in your project config. Use this when your project defines `defineConfig({ options })`.

```ts
import { createRunCommand } from "@rune-cli/rune/test";
import config from "../rune.config";

const runCommand = createRunCommand(config);
```

The returned function has the same call shape as `runCommand(command, argv, context)` and injects `config.options` into each command execution.

### CommandExecutionResult

#### `exitCode`

- **Type:** `number`

Process exit code (`0` for success).

#### `stdout`

- **Type:** `string`

Captured stdout output.

#### `stderr`

- **Type:** `string`

Captured stderr output.

#### `error`

- **Type:** `CommandFailure | undefined`

Structured error information, if the command failed.

#### `data`

- **Type:** `TCommandData | undefined`

Return value from `run()` when the command uses `json: true`. `TCommandData` is inferred from the passed command's `run()` return type. This is populated regardless of whether `--json` is passed; the `--json` flag controls whether `output.log()` is suppressed, not whether `data` is captured.

## Examples

### Testing validation errors

```ts
test("requires an id argument", async () => {
  const result = await runCommand(command, []);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).not.toBe("");
});
```

### Testing default values

```ts
const command = defineCommand({
  options: [{ name: "count", type: "number", default: 1 }],
  run({ options, output }) {
    output.log(`count=${options.count}`);
  },
});

test("uses default count", async () => {
  const result = await runCommand(command, []);

  expect(result.stdout).toBe("count=1\n");
});
```

### Testing JSON mode

```ts
const command = defineCommand({
  json: true,
  run() {
    return { items: [1, 2, 3] };
  },
});

test("returns structured data", async () => {
  const result = await runCommand(command, ["--json"]);

  expect(result.data).toEqual({ items: [1, 2, 3] });
  expect(result.stdout).toBe("");
});
```
