# Rune

TypeScript-first, agent-friendly CLI framework. Directory structure maps directly to CLI command structure.

## Toolchain

- Use `vp` for all project tasks. Do not use pnpm/npm/yarn directly for running tasks.
- Use Node `>=24.12.0`.
- Common commands:
  - `vp install`
  - `vp fmt`
  - `vp lint`
  - `vp run check --filter './packages/*'`
  - `vp run test --filter './packages/*'`
  - `vp run build --filter './packages/*'`
  - `vp run ready`
  - `vp add <pkg>` / `vp remove <pkg>`
  - `vp dlx <cmd>` and `vpx <cmd>`

## Workflow

- Prefer targeted tests while iterating; before finishing, run `vp run check --filter './packages/*' && vp run test --filter './packages/*'`.
- Use `vp run ready` when you need the full repo readiness check.

## Project Rules

- In workspace packages, import test APIs from `vite-plus/test`, never from `vite` or `vitest`.
- `examples/starter` is a user-facing scaffold example for `create-rune-app`, so it may intentionally use consumer-app conventions such as direct `vitest` imports.
- `core` must not depend on filesystem scanning or on `rune`.
- Do not throw for expected parse or validation failures. Use explicit result types with `ok: true` / `ok: false`.
- For schema-backed fields, use the Standard Schema contract via `schema["~standard"].validate(value)`. Do not call library-specific APIs such as Zod `.parse()`.
- Keep source and test filenames in `kebab-case`.
- Preserve the manifest-routing invariant: at runtime, only the matched leaf command module should be loaded.
- TypeScript-first: do not add runtime checks for constraints already enforced by the type system (e.g. required properties, discriminated unions). Reserve runtime validation for domain rules that types cannot express, such as string format, uniqueness, or ordering.

## Documentation

- When changing public API behavior, update the corresponding documentation in `docs/src/content/docs/` for both English and Japanese (`ja/`) versions.

## Testing

- Prefer in-process command tests via `runCommand` instead of spawning a process unless process behavior is the thing being tested.
- Type inference tests use `expectTypeOf()` from `vite-plus/test`.

## Rune CLI (`packages/rune/src/cli/`)

- Rune's own CLI uses the framework's routing (`resolveCommandRoute`) and help rendering (`renderResolvedHelp`) via a static manifest built from `defineCommand` definitions. Adding a Rune subcommand requires changes in four places: `rune-commands.ts` (defineCommand), `rune-manifest.ts` (manifest nodes, childNames, commandMap), and `rune-cli.ts` (dispatch).
- Adding a Rune-managed option (like `--project`) requires updating both `tryParseProjectOption` and `isRuneHelpRequested`, which must skip the same set of known options.
- `rune run` argument parsing (`parseRunArgs`) and `rune build` argument parsing (`parseBuildArgs`) are hand-written, not routed through the framework's `runCommandPipeline`, because `rune run` passes remaining args through to the user's CLI.
