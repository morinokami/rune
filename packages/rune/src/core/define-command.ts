import type { DefineCommandInput, DefinedCommand } from "./command-types";
import type { CommandArgField, CommandOptionField, NormalizeFields } from "./field-types";
import type {
  ValidateArgOrder,
  ValidateDuplicateShortNames,
  ValidateFieldNames,
  ValidateNegationCollision,
  ValidateReservedNames,
  ValidateUniqueNames,
} from "./validate-types";

import { isSchemaField } from "./schema-field";
import { validateCommandAliases } from "./validate-command-aliases";
import {
  OPTION_NAME_RE,
  validateEnumFields,
  validateOptionEnvVars,
  validateOptionMultipleFlags,
  validateOptionNameFormats,
  validateOptionNegationCollisions,
  validateOptionShortFormats,
  validateUniqueFieldAndAliasNames,
  validateUniqueOptionShortNames,
} from "./validate-option-fields";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Defines a CLI command with optional metadata, positional arguments, options,
 * and a function to execute when the command is invoked.
 *
 * The command module's default export should be the return value of this function.
 *
 * @example
 * ```ts
 * export default defineCommand({
 *   description: "Greet someone",
 *   options: [
 *     { name: "loud", type: "boolean", short: "l" },
 *   ],
 *   args: [
 *     { name: "name", type: "string", required: true },
 *   ],
 *   run(ctx) {
 *     const greeting = `Hello, ${ctx.args.name}!`;
 *     console.log(ctx.options.loud ? greeting.toUpperCase() : greeting);
 *   },
 * });
 * ```
 *
 * Required positional arguments must precede optional ones. This ordering is
 * enforced at the type level for concrete schema types and at runtime for
 * primitive fields:
 *
 * ```ts
 * // Type error — required arg after optional arg
 * defineCommand({
 *   args: [
 *     { name: "source", type: "string" },
 *     { name: "target", type: "string", required: true },
 *   ],
 *   run() {},
 * });
 *
 * // Type error — required primitive arg after optional schema arg
 * defineCommand({
 *   args: [
 *     { name: "mode", schema: z.string().optional() },
 *     { name: "target", type: "string", required: true },
 *   ],
 *   run() {},
 * });
 * ```
 *
 * When a schema type is widened to plain `StandardSchemaV1` (e.g. stored in
 * a variable without a concrete type), optionality information is lost and
 * the ordering check is skipped for that field.
 */
export function defineCommand<
  const TArgsFields extends readonly CommandArgField[] | undefined = undefined,
  const TOptionsFields extends readonly CommandOptionField[] | undefined = undefined,
  const TJson extends true | undefined = undefined,
  TRunResult = TJson extends true ? unknown : void | Promise<void>,
>(
  input: DefineCommandInput<TArgsFields, TOptionsFields, TJson, TRunResult> &
    ValidateArgOrder<TArgsFields> &
    ValidateFieldNames<TArgsFields, TOptionsFields> &
    ValidateUniqueNames<TArgsFields, TOptionsFields> &
    ValidateDuplicateShortNames<TOptionsFields> &
    ValidateNegationCollision<TOptionsFields> &
    ValidateReservedNames<TOptionsFields, TJson>,
): DefinedCommand<
  NormalizeFields<TArgsFields, CommandArgField>,
  NormalizeFields<TOptionsFields, CommandOptionField>,
  TJson extends true ? true : false,
  TJson extends true ? Awaited<TRunResult> : undefined
> {
  const jsonEnabled = input.json === true;

  // Validate command-level metadata first, then per-field format/reserved-name
  // rules, and only then cross-field relationships like duplicates/collisions.
  if (input.aliases) {
    validateCommandAliases(input.aliases);
  }
  if (input.args) {
    validateArgNames(input.args);
    validateEnumFields(input.args, "argument");
    validateUniqueFieldAndAliasNames(input.args, "argument");
    validateArgOrdering(input.args);
  }
  if (input.options) {
    validateOptionNameFormats(input.options);
    validateReservedNames(input.options, jsonEnabled);
    validateOptionShortFormats(input.options);
    validateOptionMultipleFlags(input.options);
    validateOptionEnvVars(input.options);
    validateEnumFields(input.options, "option");
    validateUniqueFieldAndAliasNames(input.options, "option");
    validateUniqueOptionShortNames(input.options);
    validateOptionNegationCollisions(input.options);
  }

  const command: DefinedCommand<
    NormalizeFields<TArgsFields, CommandArgField>,
    NormalizeFields<TOptionsFields, CommandOptionField>,
    TJson extends true ? true : false,
    TJson extends true ? Awaited<TRunResult> : undefined
  > = {
    description: input.description,
    json: jsonEnabled as TJson extends true ? true : false,
    aliases: [...(input.aliases ?? [])],
    examples: [...(input.examples ?? [])],
    args: copyNormalizedFields<TArgsFields, CommandArgField>(input.args),
    options: copyNormalizedFields<TOptionsFields, CommandOptionField>(input.options),
    help: input.help,
    run: input.run as DefinedCommand<
      NormalizeFields<TArgsFields, CommandArgField>,
      NormalizeFields<TOptionsFields, CommandOptionField>,
      TJson extends true ? true : false,
      TJson extends true ? Awaited<TRunResult> : undefined
    >["run"],
  };

  Object.defineProperty(command, DEFINED_COMMAND_BRAND, {
    value: true,
    enumerable: false,
  });

  return command;
}

export function isDefinedCommand(
  value: unknown,
): value is DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [DEFINED_COMMAND_BRAND]?: unknown })[DEFINED_COMMAND_BRAND] === true
  );
}

// ---------------------------------------------------------------------------
// Private constants
// ---------------------------------------------------------------------------

const DEFINED_COMMAND_BRAND = Symbol.for("@rune-cli/defined-command");

// Hyphenated field names (args or options) must follow the same kebab-case
// rules so that the type-level KebabToCamelCase and the runtime regex produce
// identical camelCase aliases. OPTION_NAME_RE already enforces this for
// options; this helper applies the same check to argument names that contain
// hyphens (plain non-hyphenated arg names remain unrestricted).
const HYPHENATED_NAME_RE = OPTION_NAME_RE;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function validateArgNames(args: readonly CommandArgField[]): void {
  for (const field of args) {
    if (field.name.length === 0) {
      throw new Error(`Invalid argument name "${field.name}". Names must be non-empty.`);
    }

    if (field.name.includes("-") && !HYPHENATED_NAME_RE.test(field.name)) {
      throw new Error(
        `Invalid argument name "${field.name}". Hyphenated names must start with a letter and contain only letters, numbers, and single internal hyphens.`,
      );
    }
  }
}

const RESERVED_OPTION_NAMES = new Set(["help"]);
const RESERVED_SHORT_NAMES = new Set(["h"]);

function validateReservedNames(options: readonly CommandOptionField[], json: boolean): void {
  for (const field of options) {
    if (RESERVED_OPTION_NAMES.has(field.name) || (json && field.name === "json")) {
      throw new Error(
        `Option name "${field.name}" is reserved by the framework. The --${field.name} flag is built-in.`,
      );
    }

    if (field.short !== undefined && RESERVED_SHORT_NAMES.has(field.short)) {
      throw new Error(
        `Short name "${field.short}" for option "${field.name}" is reserved by the framework.`,
      );
    }
  }
}

function isOptionalArg(field: CommandArgField): boolean | undefined {
  if (isSchemaField(field)) {
    // Standard Schema exposes no optionality metadata and validate() can be
    // async or trigger side effects, so we cannot inspect schema fields at
    // definition time. The type-level check (IsArgOptional + ValidateArgOrder)
    // covers schema fields when concrete types are available.
    return undefined;
  }

  return field.required !== true || field.default !== undefined;
}

function validateArgOrdering(args: readonly CommandArgField[]): void {
  let firstOptionalName: string | undefined;

  for (const field of args) {
    const optional = isOptionalArg(field);

    if (optional === undefined) {
      continue;
    }

    if (optional) {
      firstOptionalName ??= field.name;
    } else if (firstOptionalName !== undefined) {
      throw new Error(
        `Required argument "${field.name}" cannot follow optional argument "${firstOptionalName}"`,
      );
    }
  }
}

function copyNormalizedFields<TFields extends readonly TField[] | undefined, TField>(
  fields: TFields | undefined,
): NormalizeFields<TFields, TField> {
  return [...(fields ?? [])] as unknown as NormalizeFields<TFields, TField>;
}
