# `src/` Layout

- `index.ts`, `runtime.ts`, `test.ts`
  - Public package entry points.
- `cli.ts`
  - The package's executable entry for the `rune` binary.
- `cli/`
  - Rune's own CLI orchestration.
  - Handles `rune dev`, `rune build`, top-level arg parsing, and process output writing.
- `manifest/`
  - Command-tree scanning and runtime resolution.
  - Contains manifest generation, routing, help rendering, and manifest-based execution.
- `project/`
  - Filesystem helpers for Rune project layout.
  - Resolves paths such as project root, `src/commands`, and `dist`.

Only the top-level entry files are exposed as package entry points. Everything under `cli/`, `manifest/`, and `project/` is internal.
