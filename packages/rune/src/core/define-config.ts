import type { HelpData } from "../manifest/runtime/build-help-data";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUNE_CONFIG_BRAND = Symbol.for("@rune-cli/rune-config");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The configuration object accepted by {@link defineConfig}. */
export interface RuneConfigInput {
  /**
   * Custom help renderer applied to all commands, groups, and unknown-command
   * messages. Receives structured {@link HelpData} and returns the formatted
   * help string.
   *
   * A per-command `help` function defined via `defineCommand` takes precedence
   * over this global renderer.
   */
  readonly help?: ((data: HelpData) => string) | undefined;
}

/** The resolved configuration object returned by {@link defineConfig}. */
export interface RuneConfig {
  readonly help?: ((data: HelpData) => string) | undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Defines a Rune configuration object for the project.
 *
 * Place the default export of this function in `rune.config.ts` at the
 * project root.
 *
 * @example
 * ```ts
 * // rune.config.ts
 * import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";
 *
 * export default defineConfig({
 *   help(data) {
 *     return `My CLI\n\n${renderDefaultHelp(data)}`;
 *   },
 * });
 * ```
 */
export function defineConfig(input: RuneConfigInput): RuneConfig {
  const config: RuneConfig = {
    help: input.help,
  };

  Object.defineProperty(config, RUNE_CONFIG_BRAND, {
    value: true,
    enumerable: false,
  });

  return config;
}

export function isRuneConfig(value: unknown): value is RuneConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [RUNE_CONFIG_BRAND]?: unknown })[RUNE_CONFIG_BRAND] === true
  );
}
