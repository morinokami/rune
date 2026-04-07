---
title: Test Utilities
description: API reference for Rune's testing utilities.
---

Rune provides `runCommand()` for testing commands in-process without spawning a child process. Import it from `@rune-cli/rune/test`.

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
): Promise<CommandExecutionResult>
```

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

- **Type:** `unknown`

Return value from `run()` when the command uses `json: true`. This is populated regardless of whether `--json` is passed; the `--json` flag controls whether `output.log()` is suppressed, not whether `data` is captured.

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
