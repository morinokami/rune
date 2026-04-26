import type { CommandOptionField, NormalizeFields } from "./field-types";
import type { HelpData } from "./help-types";

import {
  validateEnumFields,
  validateOptionMultipleFlags,
  validateOptionNameFormats,
  validateOptionNegationCollisions,
  validateOptionShortFormats,
  validateUniqueFieldAndAliasNames,
  validateUniqueOptionShortNames,
} from "./validate-option-fields";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The configuration object accepted by {@link defineConfig}. */
export interface RuneConfigInput {
  /**
   * CLI display name used in help output and `--version` output.
   *
   * When omitted, Rune derives the name from `package.json` or the project
   * directory name.
   */
  readonly name?: string | undefined;

  /**
   * CLI display version used in help output and `--version` output.
   *
   * When omitted, Rune uses `package.json`'s `version` field when available.
   */
  readonly version?: string | undefined;

  /**
   * Custom help renderer applied to all commands, groups, and unknown-command
   * messages. Receives structured {@link HelpData} and returns the formatted
   * help string.
   *
   * A per-command `help` function defined via `defineCommand` takes precedence
   * over this global renderer.
   */
  readonly help?: ((data: HelpData) => string) | undefined;

  /**
   * Global options available to every executable command in this project.
   *
   * These use the same field shape as command `options`. Global options must
   * be optional: `required: true` and schemas that reject `undefined` are not
   * supported.
   */
  readonly options?: readonly CommandOptionField[] | undefined;
}

/** The resolved configuration object returned by {@link defineConfig}. */
export interface RuneConfig<TInput extends RuneConfigInput = RuneConfigInput> {
  readonly name?: string | undefined;
  readonly version?: string | undefined;
  readonly help?: ((data: HelpData) => string) | undefined;
  readonly options: NormalizeFields<TInput["options"], CommandOptionField>;
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
export function defineConfig<const TInput extends RuneConfigInput>(
  input: TInput,
): RuneConfig<TInput> {
  if (input.options) {
    validateConfigOptions(input.options);
  }

  const config: RuneConfig = {
    name: input.name,
    version: input.version,
    help: input.help,
    options: [...(input.options ?? [])],
  };

  Object.defineProperty(config, RUNE_CONFIG_BRAND, {
    value: true,
    enumerable: false,
  });

  return config as RuneConfig<TInput>;
}

export function isRuneConfig(value: unknown): value is RuneConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [RUNE_CONFIG_BRAND]?: unknown })[RUNE_CONFIG_BRAND] === true
  );
}

// ---------------------------------------------------------------------------
// Private constants
// ---------------------------------------------------------------------------

const RUNE_CONFIG_BRAND = Symbol.for("@rune-cli/rune-config");

// `json` is reserved unconditionally for global options because the rule has to
// be uniform across every command (per-command `json: true` cannot make a
// global option valid in some commands but invalid in others). `help` and short
// `h` are framework-managed everywhere.
const RESERVED_CONFIG_OPTION_NAMES = new Set(["help", "json"]);
const RESERVED_CONFIG_SHORT_NAMES = new Set(["h"]);

function validateConfigOptions(options: readonly CommandOptionField[]): void {
  validateOptionNameFormats(options);
  validateConfigReservedNames(options);
  validateOptionShortFormats(options);
  validateOptionMultipleFlags(options);
  validateEnumFields(options, "option");
  validateUniqueFieldAndAliasNames(options, "option");
  validateUniqueOptionShortNames(options);
  validateOptionNegationCollisions(options);
  validateNoRequiredConfigOptions(options);
}

function validateConfigReservedNames(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if (RESERVED_CONFIG_OPTION_NAMES.has(field.name)) {
      throw new Error(
        `Option name "${field.name}" is reserved by the framework. The --${field.name} flag is built-in.`,
      );
    }

    if (field.short !== undefined && RESERVED_CONFIG_SHORT_NAMES.has(field.short)) {
      throw new Error(
        `Short name "${field.short}" for option "${field.name}" is reserved by the framework.`,
      );
    }
  }
}

function validateNoRequiredConfigOptions(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if ("required" in field && field.required === true) {
      throw new Error(`Config option "${field.name}" cannot use required: true.`);
    }
  }
}
