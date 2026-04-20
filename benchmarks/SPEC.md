# Benchmark CLI Spec

Each fixture implements the same minimal CLI so numbers are comparable.

## Commands

- `greet <name> [--loud]`
  - Prints `hello, <name>` (or uppercased if `--loud`).
- `math add <a> <b>`
  - Prints the integer sum of `a` and `b`.
- `heavy`
  - Imports `typescript` (a realistically heavy dependency) and prints its
    version. The subcommand module MUST have `typescript` as a top-level import
    so its load cost is only paid when the framework actually needs the module.
  - Fixtures must use the framework's **lazy / on-demand loading** facility so
    unrelated commands (e.g. `--help`, `math add`) do not pay that cost:
    - rune / oclif: file-based routing loads only the matched command module.
    - citty: subcommand registered as `() => import('./heavy.mjs').then(...)`.
    - gunshi: `lazy(() => import('./heavy.mjs'), meta)`.
    - commander / yargs: no lazy-command API; use a dynamic `import()` inside
      the action/handler.

## Scenarios

Run against each fixture's built entry at `dist/cli.mjs`:

1. `help` — `--help`. Lazy frameworks should avoid loading the heavy module.
2. `add` — `math add 1 2`. Exercises routing + execution of a lightweight
   subcommand; same lazy-loading expectation as `help`.
3. `heavy` — `heavy`. All fixtures pay the typescript load cost here; this is
   the baseline for that module.

## Metrics

- **Wall-clock time** — `scripts/bench.mjs` via hyperfine (mean ± σ, min/max).
- **Peak RSS** — `scripts/memory.mjs` via `/usr/bin/time` (median across 10
  samples, min/max).

Keep the surface tiny; richer scenarios (deep nesting, schema validation, many
subcommands) can be added later alongside the fixtures.
