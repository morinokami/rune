# Rune

TypeScript-first, agent-friendly CLI framework. Directory structure maps directly to CLI command structure.

## Toolchain

- Use `vp` for all project tasks. Do not use pnpm/npm/yarn directly for running tasks.
- Use Node `>=24.12.0`.
- Common commands:
  - `vp install`
  - `vp fmt`
  - `vp lint`
  - `vp run --filter './packages/*' check`
  - `vp run --filter './packages/*' test`
  - `vp run --filter './packages/*' build`
  - `vp run ready`
  - `vp add <pkg>` / `vp remove <pkg>`
  - `vp dlx <cmd>` and `vpx <cmd>`

## Workflow

- Prefer targeted tests while iterating; before finishing, run `vp run --filter './packages/*' check && vp run --filter './packages/*' test`.
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

## Documentation & Skills

- When changing public API behavior, update the corresponding documentation in `docs/src/content/docs/` for both English and Japanese (`ja/`) versions, the relevant skills in `skills/`, and the `README.md` if affected.

## Testing

- Prefer in-process command tests via `runCommand` instead of spawning a process unless process behavior is the thing being tested.
- Type inference tests use `expectTypeOf()` from `vite-plus/test`.

## Rune CLI (`packages/rune/src/cli/`)

- Rune's own CLI uses the framework's routing (`resolveCommandRoute`) and help rendering (`renderResolvedHelp`) via a static manifest built from the descriptors in `rune-subcommands.ts`. Adding a Rune subcommand typically requires updating `rune-subcommands.ts` (descriptor, help metadata, manifest/load wiring) and `rune-cli.ts` (top-level dispatch behavior if needed).
- Adding a Rune-managed option (like `--project`) requires updating `rune-options.ts`, and keeping `parse-rune-subcommand-args.ts` aligned so parsing and help-prefix detection continue to recognize the same Rune-managed options.
- `rune run` argument parsing (`parseRunArgs`) and `rune build` argument parsing (`parseBuildArgs`) are hand-written in `parse-rune-subcommand-args.ts`, not routed through the framework's `runCommandPipeline`, because `rune run` passes remaining args through to the user's CLI.
