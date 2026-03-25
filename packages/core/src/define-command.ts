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
    validateArgOrdering(input.args);
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
