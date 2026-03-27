// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const DEFINED_GROUP_BRAND = Symbol.for("@rune-cli/defined-group");

/** The group definition object accepted by {@link defineGroup}. */
export interface DefineGroupInput {
  /** One-line summary shown in `--help` output. */
  readonly description: string;
}

/** The normalized group object returned by `defineGroup`. */
export interface DefinedGroup {
  readonly description: string;
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

  const group: DefinedGroup = {
    description: input.description,
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
