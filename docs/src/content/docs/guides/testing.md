---
title: Testing
description: Learn how to test your Rune commands.
---

Rune provides a `runCommand()` function for testing commands in-process. `runCommand()` does not depend on any specific test runner, so it works with any test framework such as Vitest, Jest, or the Node.js built-in test runner. Import it from `@rune-cli/rune/test`.

:::note
The examples in this guide use [Vitest](https://vitest.dev/) as the test framework.
:::

## How runCommand Works

`runCommand()` takes a `string[]` of CLI tokens as input, in the same format a user would type in a terminal. Internally, it runs a single command through Rune's command-level parse-and-execute pipeline, so argv parsing, type coercion, validation, and default handling all work the same way as a real invocation. Note that top-level CLI behavior such as command routing and help rendering is not included. `runCommand()` exercises only the resolved command itself.

Because no child process is spawned, tests run fast. The result is returned as a `CommandExecutionResult` object:

- `exitCode`: process exit code (`0` for success)
- `stdout`: captured standard output
- `stderr`: captured standard error output
- `error`: structured error information if the command failed
- `data`: return value from `run()` when the command uses `json: true`

## Basic Testing

Import a command file defined as described in the [Commands](/guides/commands/) guide and pass it to `runCommand()`:

```ts
import { expect, test } from "vitest";
import { runCommand } from "@rune-cli/rune/test";

import greeting from "../src/commands/index.ts";

test("greets by name", async () => {
  const result = await runCommand(greeting, ["world"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("Hello, world!\n");
});
```

Arguments and options are passed as a string array, just like a real CLI invocation:

```ts
test("greets loudly with --loud flag", async () => {
  const result = await runCommand(greeting, ["world", "--loud"]);

  expect(result.stdout).toBe("HELLO, WORLD!\n");
});
```

## Testing Errors

When a command throws a [`CommandError`](/reference/command-error/), `runCommand()` captures it in `result.error`:

```ts
import { expect, test } from "vitest";
import { defineCommand, CommandError } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  run() {
    throw new CommandError({
      kind: "config/not-found",
      message: "Config file was not found",
      hint: "Create rune.config.ts",
      exitCode: 7,
    });
  },
});

test("returns structured error", async () => {
  const result = await runCommand(command);

  expect(result.exitCode).toBe(7);
  expect(result.error).toEqual({
    kind: "config/not-found",
    message: "Config file was not found",
    hint: "Create rune.config.ts",
    exitCode: 7,
  });
});
```

Unexpected exceptions are wrapped with `kind: "internal"`.

## Testing JSON Mode

For commands with `json: true`, the return value of `run()` is captured in `result.data`. Passing the `--json` flag suppresses `output.info()`, while `output.error()` continues to output:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  json: true,
  run({ output }) {
    output.info("this is suppressed with --json");
    return { items: [1, 2, 3] };
  },
});

test("returns structured data", async () => {
  const result = await runCommand(command, ["--json"]);

  expect(result.stdout).toBe("");
  expect(result.data).toEqual({ items: [1, 2, 3] });
});
```

`result.data` is populated even without the `--json` flag. The `--json` flag controls whether `output.info()` is suppressed, not whether `data` is captured.

## Injecting Context

Pass a context object as the third argument to `runCommand()` to override `ctx.cwd` without changing `process.cwd()`:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  run({ cwd, output }) {
    output.info(cwd);
  },
});

test("injects custom cwd", async () => {
  const result = await runCommand(command, [], { cwd: "/tmp/test-project" });

  expect(result.stdout).toBe("/tmp/test-project\n");
});
```

For full API details, see the [Test Utilities reference](/reference/test-utils/).
