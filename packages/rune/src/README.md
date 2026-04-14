# `src/` Layout

- `index.ts`, `cli.ts`, `test.ts`
  - Public package entry points.
- `cli.ts`
  - The package's executable entry for the `rune` binary.
- `runtime.ts`
  - Internal runtime helper re-export used when building distributable CLIs.
- `cli/`
  - Rune's own CLI orchestration.
  - Handles `rune run`, `rune build`, top-level arg parsing, and process output writing.
  - Adding a Rune subcommand starts from the built-in subcommand descriptors and then flows into CLI dispatch.
- `manifest/`
  - Command-tree scanning and runtime resolution.
  - Contains manifest generation, routing, help rendering, and manifest-based execution.
- `project/`
  - Filesystem helpers for Rune project layout.
  - Resolves paths such as project root, `src/commands`, and `dist`.

`rune run` is a thin adapter that regenerates the manifest and then hands execution to the manifest runtime.

`rune build` generates the build artifacts for the distributed CLI, including the manifest, CLI entry, and bundled command modules.

Only `index.ts`, `cli.ts`, and `test.ts` are exposed as package entry points. Everything else under `src/` is internal implementation detail.
