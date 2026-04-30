---
title: Testing
description: Learn how to test your Rune commands.
---

Rune provides the `runCommand()` function for testing commands in-process. `runCommand()` takes the same CLI tokens a user would type for the resolved command itself. `runCommand()` does not depend on any specific test runner, so it works with any test framework such as Vitest, Jest, or the Node.js built-in test runner. Import it from `@rune-cli/rune/test`.

:::note
The examples in this guide use [Vitest](https://vitest.dev/) as the test framework.
:::

You can keep tests in a separate `tests/` directory or colocate them next to command files. Files ending in `.test.ts` or `.spec.ts` under `src/commands` are ignored by Rune's command routing.

## How runCommand works

`runCommand()` takes a `string[]` of CLI tokens as input, in the same format a user would type in a terminal. Internally, it runs a single command through Rune's command-level parse-and-execute pipeline, so argv parsing, type coercion, validation, and default handling all work the same way as a real invocation. Note that top-level CLI behavior such as command routing and help rendering is not included. `runCommand()` exercises only the resolved command itself.

Because no child process is spawned, tests run fast. The result is returned as a `CommandExecutionResult` object:

- `exitCode`: process exit code (`0` for success)
- `stdout`: captured standard output
- `stderr`: captured standard error output
- `error`: structured error information if the command failed
- `data`: return value from `run()` when the command uses `json: true` (typed from the command's `run()` return value)

## Basic testing

`runCommand()` takes a command created with `defineCommand()` and executes it with the given arguments. Import the command you want to test and pass it as the first argument.

For example, here is how you would test the greeting command from the [Commands](/guides/commands/) guide:

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

Options and arguments are passed as a string array, just like a real CLI invocation:

```ts
test("greets loudly with --loud flag", async () => {
  const result = await runCommand(greeting, ["world", "--loud"]);

  expect(result.stdout).toBe("HELLO, WORLD!\n");
});
```

## Testing errors

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

Unexpected exceptions are wrapped with `kind: "rune/unexpected"`.

## Testing JSON mode

For commands with `json: true`, the return value of `run()` is captured in `result.data`. Passing the `--json` flag suppresses `output.log()`, while `output.error()` continues to output:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  json: true,
  run({ output }) {
    output.log("this is suppressed with --json");
    return { items: [1, 2, 3] };
  },
});

test("returns structured data", async () => {
  const result = await runCommand(command, ["--json"]);

  expect(result.stdout).toBe("");
  expect(result.data).toEqual({ items: [1, 2, 3] });
});
```

`result.data` is populated even without the `--json` flag. The `--json` flag controls whether `output.log()` is suppressed, not whether `data` is captured.

## Injecting context

Pass a context object as the third argument to `runCommand()` to override `ctx.cwd` without changing `process.cwd()`:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  run({ cwd, output }) {
    output.log(cwd);
  },
});

test("injects custom cwd", async () => {
  const result = await runCommand(command, [], { cwd: "/tmp/test-project" });

  expect(result.stdout).toBe("/tmp/test-project\n");
});
```

You can also inject env values for options that declare `env`. The provided env map replaces `process.env` for the command under test; it is not merged automatically and defaults to an empty map so tests stay isolated from the host environment.

```ts
const command = defineCommand({
  options: [{ name: "port", type: "number", env: "PORT", default: 3000 }],
  run({ options, output }) {
    output.log(String(options.port));
  },
});

test("uses injected env", async () => {
  const result = await runCommand(command, [], { env: { PORT: "4000" } });

  expect(result.stdout).toBe("4000\n");
});
```

If you want to keep the current process environment and add one value for the test, spread `process.env` explicitly:

```ts
test("inherits host env explicitly", async () => {
  const result = await runCommand(command, [], {
    env: { ...process.env, PORT: "4000" },
  });

  expect(result.stdout).toBe("4000\n");
});
```

You can also inject stdin. This lets commands that read `ctx.stdin` stay
in-process and isolated in tests:

```ts
const command = defineCommand({
  async run({ stdin, output }) {
    const input = stdin.isPiped ? await stdin.text() : "";
    output.log(input.trim());
  },
});

test("reads injected stdin", async () => {
  const result = await runCommand(command, [], { stdin: "hello\n" });

  expect(result.stdout).toBe("hello\n");
});
```

## Testing with global options

When your project defines `defineConfig({ options })`, create a helper that bakes in your project config once and use it like `runCommand()`:

```ts
import { expect, test } from "vitest";
import { createRunCommand } from "@rune-cli/rune/test";

import config from "../rune.config";
import deploy from "../src/commands/deploy";

const runCommand = createRunCommand(config);

test("uses the configured profile", async () => {
  const result = await runCommand(deploy, ["--profile", "dev"]);

  expect(result.exitCode).toBe(0);
});
```

This keeps command tests on the same parse-and-validation path as the real CLI without repeating the global options in each test.

For full API details, see the [Test Utilities reference](/reference/test-utils/).
