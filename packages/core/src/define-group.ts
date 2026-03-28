// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

import { validateCommandAliases } from "./define-command";

const DEFINED_GROUP_BRAND = Symbol.for("@rune-cli/defined-group");

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
}

/** The normalized group object returned by `defineGroup`. */
export interface DefinedGroup {
  readonly description: string;
  readonly aliases: readonly string[];
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
  if (typeof input.description !== "string" || input.description.length === 0) {
    throw new Error('defineGroup() requires a non-empty "description" string.');
  }

  if (input.aliases) {
    validateCommandAliases(input.aliases);
  }

  const group: DefinedGroup = {
    description: input.description,
    aliases: (input.aliases ?? []) as readonly string[],
  };

  Object.defineProperty(group, DEFINED_GROUP_BRAND, {
    value: true,
    enumerable: false,
  });

  return group;
}

export function isDefinedGroup(value: unknown): value is DefinedGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [DEFINED_GROUP_BRAND]?: unknown })[DEFINED_GROUP_BRAND] === true
  );
}
