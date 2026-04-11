import type {
  CommandArgField,
  CommandOptionField,
  DefineCommandInput,
  DefinedCommand,
  NormalizeFields,
  ValidateArgOrder,
  ValidateDuplicateShortNames,
  ValidateFieldNames,
  ValidateNegationCollision,
  ValidateReservedNames,
  ValidateUniqueNames,
} from "./command-types";

import { isSchemaField } from "./schema-field";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFINED_COMMAND_BRAND = Symbol.for("@rune-cli/defined-command");

const OPTION_NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const OPTION_SHORT_RE = /^[a-zA-Z]$/;
const COMMAND_ALIAS_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

function kebabToCamelCase(str: string): string {
  return str.replace(/-(.)/g, (_, char: string) => char.toUpperCase());
}

function validateUniqueFieldNames(
  fields: readonly (CommandArgField | CommandOptionField)[],
  kind: "argument" | "option",
): void {
  const seen = new Set<string>();

  for (const field of fields) {
    if (field.name.length === 0) {
      throw new Error(`Invalid ${kind} name "${field.name}". Names must be non-empty.`);
    }

    if (seen.has(field.name)) {
      throw new Error(`Duplicate ${kind} name "${field.name}".`);
    }

    seen.add(field.name);

    if (field.name.includes("-")) {
      const camelName = kebabToCamelCase(field.name);

      if (seen.has(camelName)) {
        throw new Error(
          `${kind === "argument" ? "Argument" : "Option"} "${field.name}" conflicts with "${camelName}" (same camelCase alias).`,
        );
      }

      seen.add(camelName);
    }
  }
}

// Hyphenated field names (args or options) must follow the same kebab-case
// rules so that the type-level KebabToCamelCase and the runtime regex produce
// identical camelCase aliases. OPTION_NAME_RE already enforces this for
// options; this helper applies the same check to argument names that contain
// hyphens (plain non-hyphenated arg names remain unrestricted).
const HYPHENATED_NAME_RE = OPTION_NAME_RE;

function validateArgNames(args: readonly CommandArgField[]): void {
  for (const field of args) {
    if (field.name.includes("-") && !HYPHENATED_NAME_RE.test(field.name)) {
      throw new Error(
        `Invalid argument name "${field.name}". Hyphenated names must start with a letter and contain only letters, numbers, and single internal hyphens.`,
      );
    }
  }
}

function validateOptionNames(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if (!OPTION_NAME_RE.test(field.name)) {
      throw new Error(
        `Invalid option name "${field.name}". Option names must start with a letter and contain only letters, numbers, and internal hyphens.`,
      );
    }
  }
}

function validateNegationCollisions(options: readonly CommandOptionField[]): void {
  const allNames = new Set(options.map((field) => field.name));

  for (const field of options) {
    if (!isSchemaField(field) && field.type === "boolean" && field.default === true) {
      const negName = `no-${field.name}`;

      if (allNames.has(negName)) {
        throw new Error(
          `Option "${negName}" conflicts with the automatic negation of boolean option "${field.name}".`,
        );
      }
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

function validateOptionShortNames(options: readonly CommandOptionField[]): void {
  const seen = new Set<string>();

  for (const field of options) {
    if (field.short === undefined) {
      continue;
    }

    if (!OPTION_SHORT_RE.test(field.short)) {
      throw new Error(
        `Invalid short name "${field.short}" for option "${field.name}". Short name must be a single letter.`,
      );
    }

    if (seen.has(field.short)) {
      throw new Error(`Duplicate short name "${field.short}" for option "${field.name}".`);
    }

    seen.add(field.short);
  }
}

export function validateCommandAliases(aliases: readonly string[]): void {
  const seen = new Set<string>();

  for (const alias of aliases) {
    if (!COMMAND_ALIAS_RE.test(alias)) {
      throw new Error(
        `Invalid command alias "${alias}". Aliases must be lowercase kebab-case (letters, digits, and internal hyphens).`,
      );
    }

    if (seen.has(alias)) {
      throw new Error(`Duplicate command alias "${alias}".`);
    }

    seen.add(alias);
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Defines a CLI command with a description, positional arguments, options,
 * and a function to execute when the command is invoked.
 *
 * The command module's default export should be the return value of this function.
 *
 * @example
 * ```ts
 * export default defineCommand({
 *   description: "Greet someone",
 *   args: [
 *     { name: "name", type: "string", required: true },
 *   ],
 *   options: [
 *     { name: "loud", type: "boolean", short: "l" },
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
  const TJson extends boolean = false,
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
  TJson,
  TJson extends true ? Awaited<TRunResult> : undefined
> {
  if (input.aliases) {
    validateCommandAliases(input.aliases);
  }

  if (input.args) {
    validateUniqueFieldNames(input.args, "argument");
    validateArgNames(input.args);
    validateArgOrdering(input.args);
  }

  if (input.options) {
    validateUniqueFieldNames(input.options, "option");
    validateOptionNames(input.options);
    validateOptionShortNames(input.options);
    validateNegationCollisions(input.options);
    validateReservedNames(input.options, (input as { json?: boolean }).json === true);
  }

  const command: DefinedCommand<
    NormalizeFields<TArgsFields, CommandArgField>,
    NormalizeFields<TOptionsFields, CommandOptionField>,
    TJson,
    TJson extends true ? Awaited<TRunResult> : undefined
  > = {
    description: input.description,
    json: ((input as { json?: boolean }).json === true) as TJson,
    aliases: (input.aliases ?? []) as readonly string[],
    examples: (input.examples ?? []) as readonly string[],
    args: (input.args ?? []) as NormalizeFields<TArgsFields, CommandArgField>,
    options: (input.options ?? []) as NormalizeFields<TOptionsFields, CommandOptionField>,
    help: input.help,
    run: input.run as DefinedCommand<
      NormalizeFields<TArgsFields, CommandArgField>,
      NormalizeFields<TOptionsFields, CommandOptionField>,
      TJson,
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
