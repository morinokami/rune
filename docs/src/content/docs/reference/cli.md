---
title: CLI
description: Reference for the rune command-line tool.
---

## `rune run`

Runs a Rune project directly from source without building. Rune-managed options (such as `--project`) must appear before the command name. Everything from the command name onward is passed through to the user's command as-is.

```bash
rune run [options] <command> [command-args...]
```

### Options

| Option | Type | Description |
|---|---|---|
| `--project <path>` | `string` | Path to the Rune project root. Defaults to the current directory. |

### Examples

```bash
rune run hello
rune run --project ./my-app hello
rune run greet world --loud
```

`rune run` regenerates `.rune/global-options.d.ts` before execution so editor type inference stays up to date.

## `rune sync`

Generates Rune project type metadata and validates global options against command options.

```bash
rune sync [options]
```

### Options

| Option | Type | Description |
|---|---|---|
| `--project <path>` | `string` | Path to the Rune project root. Defaults to the current directory. |

### Examples

```bash
rune sync
rune sync --project ./my-app
```

## `rune build`

Builds a Rune project into a distributable CLI.

```bash
rune build [options]
```

### Options

| Option | Type | Description |
|---|---|---|
| `--project <path>` | `string` | Path to the Rune project root. Defaults to the current directory. |

### Examples

```bash
rune build
rune build --project ./my-app
```

`rune build` regenerates `.rune/global-options.d.ts` and validates global options against command options before building.
