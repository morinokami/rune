# Rune

TypeScript-first, file-based CLI framework. Directory structure maps directly to CLI command structure.

## Toolchain

- Use `vp` for all project tasks. Do not use pnpm/npm/yarn directly for running tasks.
- Common commands:
  - `vp install`
  - `vp check`
  - `vp test`
  - `vp run test --filter './packages/*'`
  - `vp run build --filter './packages/*'`
  - `vp run ready`
  - `vp add <pkg>` / `vp remove <pkg>`
  - `vp dlx <cmd>` and `vpx <cmd>`

## Workflow

- Prefer targeted tests while iterating; before finishing, run `vp check && vp run test --filter './packages/*'`.
- Use `vp run ready` when you need the full repo readiness check.

## Project Rules

- Import test APIs from `vite-plus/test`, never from `vite` or `vitest`.
- `core` must not depend on filesystem scanning or on `rune`.
- Do not throw for expected parse or validation failures. Use explicit result types with `ok: true` / `ok: false`.
- For schema-backed fields, use the Standard Schema contract via `schema["~standard"].validate(value)`. Do not call library-specific APIs such as Zod `.parse()`.
- Keep source and test filenames in `kebab-case`.
- Preserve the manifest-routing invariant: at runtime, only the matched leaf command module should be loaded.
- TypeScript-first: do not add runtime checks for constraints already enforced by the type system (e.g. required properties, discriminated unions). Reserve runtime validation for domain rules that types cannot express, such as string format, uniqueness, or ordering.

## Testing

- Prefer in-process command tests via `runCommand` instead of spawning a process unless process behavior is the thing being tested.
- Type inference tests use `expectTypeOf()` from `vite-plus/test`.
