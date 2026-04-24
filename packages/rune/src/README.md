# `src/` Layout

- `index.ts`, `cli.ts`, `test.ts`
  - Public package entry points.
- `cli.ts`
  - The package's executable entry for the `rune` binary.
- `runtime.ts`
  - Internal runtime helper re-export used when building distributable CLIs.
- `core/`
  - Runtime primitives (`defineCommand`, `defineGroup`, `runCommandPipeline`, command/field types, argument parsing, etc.).
  - Re-exported through `index.ts` and inlined into the user's built CLI.
- `test-utils/`
  - In-process test helpers (`runCommand`) re-exported via `test.ts` (`@rune-cli/rune/test`).
- `cli/`
  - Rune's own CLI orchestration.
  - Handles `rune run`, `rune build`, top-level arg parsing, and process output writing.
  - Adding a Rune subcommand starts from the built-in subcommand descriptors and then flows into CLI dispatch.
- `manifest/`
  - Command-tree scanning and runtime resolution.
  - Contains manifest generation (`generate/`, dev-time only), routing, help rendering, and manifest-based execution (`runtime/`, inlined into the user's built CLI).
- `project/`
  - Filesystem helpers for Rune project layout.
  - Resolves paths such as project root, `src/commands`, and `dist`.

## Dev-time vs Runtime layers

The `src/` tree splits into two layers with different bundling semantics:

- **Runtime layer** (`core/`, `manifest/runtime/`, `runtime.ts`, `test-utils/`): inlined into the user's built CLI by `rune build`. Any bare import that escapes this layer must be listed in `BUNDLED_PACKAGE_NAMES` in `cli/rolldown-shared.ts`, otherwise it will be left external and fail to resolve from the user's `node_modules` (especially under pnpm).
- **Dev-time layer** (`cli/`, `manifest/generate/`, `project/`): only runs while `rune` itself executes (`rune run` / `rune build`). Its dependencies resolve from rune's own `node_modules` and never appear in the user's output.

`rune run` is a thin adapter that regenerates the manifest and then hands execution to the manifest runtime.

`rune build` generates the build artifacts for the distributed CLI, including the manifest, CLI entry, and bundled command modules.

Only `index.ts`, `cli.ts`, and `test.ts` are exposed as package entry points. Everything else under `src/` is internal implementation detail.
