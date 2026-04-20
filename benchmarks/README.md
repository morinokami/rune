# benchmarks

Compares Rune against other CLI frameworks on identical fixtures.

Requires [hyperfine](https://github.com/sharkdp/hyperfine) on `PATH` for the
wall-clock benchmark, and a BSD/GNU `/usr/bin/time` (macOS or Linux) for the
memory benchmark.

## Layout

- `SPEC.md` — the CLI each fixture implements and the scenarios measured.
- `fixtures/<framework>/` — one independent package per framework (rune,
  commander, yargs, citty, oclif, gunshi). Each exposes a runnable entry at
  `dist/cli.mjs`.
- `scripts/bench.mjs` — builds fixtures and runs hyperfine (wall-clock time).
- `scripts/memory.mjs` — measures peak RSS via `/usr/bin/time`.
- `results/` — JSON exports from each script (gitignored).

## Run

```sh
vp install
node benchmarks/scripts/bench.mjs     # builds fixtures + hyperfine time
node benchmarks/scripts/memory.mjs    # peak RSS (needs dist/ from bench.mjs)
```

`bench.mjs`:

1. Builds each fixture via `vp run --filter ./benchmarks/fixtures/<name> build`.
   - `rune` uses `rune build` (produces a bundled `dist/cli.mjs`).
   - `oclif` additionally runs `vp exec oclif manifest` to pre-generate
     `oclif.manifest.json` so unrelated commands do not import every command
     class.
   - The rest copy `src/` to `dist/`.
2. Runs hyperfine for every (fixture × scenario) pair with 3 warmup runs.
3. Writes per-scenario JSON + an index file under `benchmarks/results/`.

`memory.mjs`:

1. Runs each (fixture × scenario) `/usr/bin/time -l` (macOS) or `-v` (Linux),
   parses peak RSS, and records median / min / max across 10 samples with
   2 warmup runs.
2. Writes a single JSON to `benchmarks/results/<timestamp>-memory.json`.

## Adding a framework

1. Create `fixtures/<name>/` with its own `package.json` (private,
   `"type": "module"`).
2. Implement every command in `SPEC.md`, using the framework's **idiomatic**
   style and its **lazy / on-demand loading** facility for `heavy` (see SPEC).
3. Produce a runnable entry at `dist/cli.mjs` (either by bundling or copying
   `src/` during `build`).
4. Register the fixture in `scripts/bench.mjs` and `scripts/memory.mjs`.
