---
title: CommandError
description: API reference for the CommandError class.
---

`CommandError` is an error class for signaling command failures with structured information. When thrown from a command's `run` function, Rune catches it and formats the output appropriately, including structured JSON output when `--json` is used.

```ts
import { defineCommand, CommandError } from "@rune-cli/rune";

export default defineCommand({
  args: [{ name: "id", type: "string", required: true }],
  run({ args }) {
    throw new CommandError({
      kind: "not-found",
      message: `Project "${args.id}" not found`,
      hint: "Run 'my-cli project list' to see available projects",
    });
  },
});
```

## Constructor

```ts
new CommandError(init: CommandErrorInit)
```

### CommandErrorInit

#### `kind`

- **Type:** `string`
- **Required**

A string that categorizes the error for programmatic consumers. In `--json` mode, this value appears in the output so that callers can handle specific error types without parsing the message. Choose a stable, descriptive identifier such as `"not-found"`, `"already-exists"`, or `"validation"`. The `rune/*` namespace is reserved for framework-generated failures.

#### `message`

- **Type:** `string`
- **Required**

A human-readable error message.

#### `hint`

- **Type:** `string`
- **Optional**

A suggestion for how to resolve the error.

#### `details`

- **Type:** `JsonValue`
- **Optional**

Arbitrary structured data included in JSON output.

#### `exitCode`

- **Type:** `number`
- **Default:** `1`

Process exit code.

#### `cause`

- **Type:** `unknown`
- **Optional**

The underlying error, passed to the native `Error` constructor.

## CommandFailure

`CommandFailure` is the serialized shape of a `CommandError`, used in test results (e.g. `runCommand().error`). Note that the JSON error output written to stdout in `--json` mode uses a different shape: `{ error: { kind, message, hint?, details? } }`, which omits `exitCode`.

```ts
interface CommandFailure {
  readonly kind: string;
  readonly message: string;
  readonly hint?: string;
  readonly details?: JsonValue;
  readonly exitCode: number;
}
```
