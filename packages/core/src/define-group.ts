import { validateCommandAliases } from "./validate-command-aliases";

/** The group definition object accepted by {@link defineGroup}. */
export interface DefineGroupInput {
  /** One-line summary shown in `--help` output. */
  readonly description: string;
  /**
   * Alternative names for this command group. Each alias is an additional path
   * segment that routes to this group. Aliases must follow kebab-case rules
   * (lowercase letters, digits, and internal hyphens).
   */
  readonly aliases?: readonly string[] | undefined;
  /**
   * Usage examples shown in the `Examples:` section of `--help` output.
   * Each entry is a string representing a full command invocation.
   */
  readonly examples?: readonly string[] | undefined;
}

/** The normalized group object returned by `defineGroup`. */
export interface DefinedGroup {
  readonly description: string;
  readonly aliases: readonly string[];
  readonly examples: readonly string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Defines metadata for a command group (a directory that only groups
 * subcommands without being executable itself).
 *
 * Place the default export of this function in a `_group.ts` file inside a
 * command directory.
 *
 * @example
 * ```ts
 * // src/commands/project/_group.ts
 * export default defineGroup({
 *   description: "Manage projects",
 * });
 * ```
 */
export function defineGroup(input: DefineGroupInput): DefinedGroup {
  if (input.aliases) {
    validateCommandAliases(input.aliases);
  }

  return {
    description: input.description,
    aliases: [...(input.aliases ?? [])],
    examples: [...(input.examples ?? [])],
  };
}
