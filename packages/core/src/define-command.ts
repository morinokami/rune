import type {
  CommandArgField,
  CommandOptionField,
  DefineCommandInput,
  DefinedCommand,
  NormalizeFields,
  ValidateArgOrder,
} from "./command-types";

import { isSchemaField } from "./schema-field";

const DEFINED_COMMAND_BRAND = Symbol.for("@rune-cli/defined-command");

const OPTION_NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const ALIAS_RE = /^[a-zA-Z]$/;

function validateFieldShape(
  fields: readonly (CommandArgField | CommandOptionField)[],
  kind: "argument" | "option",
): void {
  for (const field of fields) {
    // Cast to a loose shape so the check works even when the union has
    // already been narrowed to `never` by the type-level constraints.
    const raw = field as { name: string; type?: unknown; schema?: unknown };

    if (raw.schema === undefined && raw.type === undefined) {
      throw new Error(
        `${kind === "argument" ? "Argument" : "Option"} "${raw.name}" must have either a "type" or "schema" property.`,
      );
    }
  }
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

function validateOptionAliases(options: readonly CommandOptionField[]): void {
  const seen = new Set<string>();

  for (const field of options) {
    if (field.alias === undefined) {
      continue;
    }

    if (!ALIAS_RE.test(field.alias)) {
      throw new Error(
        `Invalid alias "${field.alias}" for option "${field.name}". Alias must be a single letter.`,
      );
    }

    if (seen.has(field.alias)) {
      throw new Error(`Duplicate alias "${field.alias}" for option "${field.name}".`);
    }

    seen.add(field.alias);
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
 *     { name: "loud", type: "boolean", alias: "l" },
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
>(
  input: DefineCommandInput<TArgsFields, TOptionsFields> & ValidateArgOrder<TArgsFields>,
): DefinedCommand<
  NormalizeFields<TArgsFields, CommandArgField>,
  NormalizeFields<TOptionsFields, CommandOptionField>
> {
  if (input.args) {
    validateFieldShape(input.args, "argument");
    validateUniqueFieldNames(input.args, "argument");
    validateArgOrdering(input.args);
  }

  if (input.options) {
    validateFieldShape(input.options, "option");
    validateUniqueFieldNames(input.options, "option");
    validateOptionNames(input.options);
    validateOptionAliases(input.options);
  }

  const command = {
    description: input.description,
    args: (input.args ?? []) as NormalizeFields<TArgsFields, CommandArgField>,
    options: (input.options ?? []) as NormalizeFields<TOptionsFields, CommandOptionField>,
    run: input.run,
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
