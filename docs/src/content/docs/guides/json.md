---
title: JSON Output
description: Learn how to enable JSON output in Rune commands.
---

Rune aims to make it easy to build CLIs that treat both humans and agents as first-class users, balancing DX (Developer Experience) with AX (Agent Experience). As part of this foundation for AX, Rune provides a built-in mechanism for outputting command results in machine-readable JSON format.

## Enabling JSON mode

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

Without `json`, `run()` is typed as returning `void`. When `json: true` is set, `run()` can return a value, and that return type is preserved by helpers such as `runCommand().data`. The return value must be serializable by `JSON.stringify()`. If a non-serializable value such as `BigInt` is returned, Rune treats it as an error.

Commands with `json: true` also receive `options.json` in `run()`. The value reflects the effective JSON mode for the current invocation: it is `true` when the user passed `--json` or when Rune auto-enabled JSON mode under an AI agent, and `false` otherwise. To check whether the user explicitly passed the flag, inspect `rawArgs`.

## Output behavior

When a user runs the command with the `--json` flag, the return value of `run()` is printed to stdout as a single-line JSON document (no indentation):

```bash
$ your-cli projects list --json
{"projects":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
```

When the `--json` flag is passed, `output.log()` calls are automatically suppressed. `output.error()` continues to write to stderr. In JSON mode, stdout always contains exactly one JSON document regardless of success or failure, so it can be consumed directly by tools like `jq` or other programs.

Without the `--json` flag, `output.log()` works as normal and the return value of `run()` is not printed. This allows a single command to serve both human-readable and agent-friendly output:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "List all projects",
  json: true,
  run({ options, output }) {
    const projects = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ];

    // Only displayed without --json
    if (!options.json) {
      for (const p of projects) {
        output.log(`${p.id}: ${p.name}`);
      }
    }

    // Output as JSON with --json
    return { projects };
  },
});
```

Only output written through the framework's `output` API is suppressed in JSON mode. Output written directly via `console.log()` or `process.stdout.write()` is not suppressed and will corrupt the JSON payload. Always use `output.log()` and `output.error()` for command output.

## Automatic activation under AI agents

For commands declared with `json: true`, Rune automatically enables JSON mode when it detects that the CLI is being invoked by an AI agent (e.g. Claude Code, Cursor, Codex), even without an explicit `--json` flag. This lets a single command serve humans with rich text output and agents with structured JSON, without requiring agents to discover and pass `--json` themselves.

### Opting out: `RUNE_DISABLE_AUTO_JSON`

Set `RUNE_DISABLE_AUTO_JSON=1` (or `true`) to suppress this auto-activation. With it set, JSON mode is enabled only when `--json` is explicitly passed, just as if the CLI were run by a human.

```bash
RUNE_DISABLE_AUTO_JSON=1 your-cli projects list
```

This is primarily intended for AI agents that are themselves *developing* a Rune-based CLI: without this escape hatch, every invocation under the agent returns JSON, hiding the human-facing `output.log()` rendering that the agent is trying to verify. Setting the variable only affects Rune's JSON mode auto-activation; it does not change other agent-aware behavior elsewhere in the toolchain.

The variable has no effect inside the `runCommand()` test harness, which already disables agent detection by default for deterministic tests.

## Why `output.log()` matters

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

## Error output

When a command fails in JSON mode, error information is output to stdout as a JSON object. This applies not only to failures within `run()`, but also to argument parsing errors such as missing required arguments:

```bash
$ your-cli projects list --json
{"error":{"kind":"config/not-found","message":"Config file was not found","hint":"Create rune.config.ts"}}
```

The error payload includes the following fields:

- `kind`: the error category
- `message`: the error message
- `hint`: a hint for resolution (when specified via [`CommandError`](/reference/command-error/))
- `details`: additional structured data (only when serializable)

## Testing

For how to test commands with JSON mode, see the [Testing](/guides/testing/#testing-json-mode) guide.
