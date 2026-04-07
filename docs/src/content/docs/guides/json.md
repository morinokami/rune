---
title: JSON Output
description: Learn how to enable JSON output in Rune commands.
---

Rune aims to make it easy to build CLIs that treat both humans and agents as first-class users, balancing DX (Developer Experience) with AX (Agent Experience). As part of this foundation for AX, Rune provides a built-in mechanism for outputting command results in machine-readable JSON format.

## Enabling JSON Mode

Set `json: true` in `defineCommand()` to enable JSON mode for a command. In JSON mode, the return value of the `run()` function becomes the command's structured output:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "List all projects",
  json: true,
  run() {
    const projects = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ];
    return { projects };
  },
});
```

Without `json`, `run()` is typed as returning `void`. When `json: true` is set, the return type of `run()` becomes `unknown`, allowing it to return a value. The return value must be serializable by `JSON.stringify()`. If a non-serializable value such as `BigInt` is returned, Rune treats it as an error.

## Output Behavior

When a user runs the command with the `--json` flag, the return value of `run()` is printed to stdout as formatted JSON:

```bash
$ your-cli projects list --json
{
  "projects": [
    {
      "id": 1,
      "name": "alpha"
    },
    {
      "id": 2,
      "name": "beta"
    }
  ]
}
```

When the `--json` flag is passed, `output.log()` calls are automatically suppressed. `output.error()` continues to write to stderr. In JSON mode, stdout always contains exactly one JSON document regardless of success or failure, so it can be consumed directly by tools like `jq` or other programs.

Without the `--json` flag, `output.log()` works as normal and the return value of `run()` is not printed. This allows a single command to serve both human-readable and agent-friendly output:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "List all projects",
  json: true,
  run({ output }) {
    const projects = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ];

    // Only displayed without --json
    for (const p of projects) {
      output.log(`${p.id}: ${p.name}`);
    }

    // Output as JSON with --json
    return { projects };
  },
});
```

Only output written through the framework's `output` API is suppressed in JSON mode. Output written directly via `console.log()` or `process.stdout.write()` is not suppressed and will corrupt the JSON payload. Always use `output.log()` and `output.error()` for command output.

## Why `output.log()` Matters

Rune's output helpers are not just a style preference:

- `output.log()` is the normal way to write human-readable stdout from a command.
- `output.error()` writes to stderr and is not suppressed by `--json`.
- `runCommand()` can capture output written through these helpers in tests.
- For commands with `json: true`, Rune suppresses `output.log()` when `--json` is passed so stdout contains only the JSON payload.

If you write directly with `console.log()` or `process.stdout.write()`, Rune cannot suppress that output in JSON mode.

If `run()` does not return an explicit value (i.e. returns `undefined`), the JSON output will be `null`.

:::note
The `--json` flag is only recognized before the `--` terminator. If placed after `--` (e.g. `-- --json`), it is treated as a regular argument.
:::

## Error Output

When a command fails in JSON mode, error information is output to stdout as a JSON object. This applies not only to failures within `run()`, but also to argument parsing errors such as missing required arguments:

```bash
$ your-cli projects list --json
{
  "error": {
    "kind": "config/not-found",
    "message": "Config file was not found",
    "hint": "Create rune.config.ts"
  }
}
```

The error payload includes the following fields:

- `kind`: the error category
- `message`: the error message
- `hint`: a hint for resolution (when specified via [`CommandError`](/reference/command-error/))
- `details`: additional structured data (only when serializable)

## Testing

For how to test commands with JSON mode, see the [Testing](/guides/testing/#testing-json-mode) guide.
