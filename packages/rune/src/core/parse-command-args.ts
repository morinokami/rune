import type { StandardSchemaV1 } from "@standard-schema/spec";

import { parseArgs } from "node:util";

import type { DefinedCommand, InferNamedFields } from "./command-types";
import type { EnumField } from "./enum-field";
import type {
  CommandArgField,
  CommandOptionField,
  PrimitiveArgField,
  PrimitiveOptionField,
} from "./field-types";

import { addCamelCaseAliases } from "./camel-case-aliases";
import { isEnumField, matchEnumValue } from "./enum-field";
import { isSchemaField } from "./schema-field";

// Parsed command input ready to be passed into the low-level executor.
export interface ParsedCommandInput<TOptions, TArgs> {
  readonly options: TOptions;
  readonly args: TArgs;
  readonly rawArgs: readonly string[];
}

// Parse failure shape used before command execution begins.
export interface ParseCommandArgsError {
  readonly message: string;
}

// Result of parsing and validating raw CLI tokens for a single command.
export type ParseCommandArgsResult<TOptions, TArgs> =
  | {
      readonly ok: true;
      readonly value: ParsedCommandInput<TOptions, TArgs>;
    }
  | {
      readonly ok: false;
      readonly error: ParseCommandArgsError;
    };

// Result of resolving a field from CLI input, defaults, or omission rules.
type ResolvedField =
  | { readonly ok: true; readonly present: true; readonly value: unknown }
  | { readonly ok: true; readonly present: false };

type ParseFailure = {
  readonly ok: false;
  readonly error: ParseCommandArgsError;
};

type ResolveFieldResult = ResolvedField | ParseFailure;

// Result of parsing or validating a provided raw value for a single field.
type ParsedFieldValue = { readonly ok: true; readonly value: unknown } | ParseFailure;

type ParseArgsOptionType = "boolean" | "string";

type ParseArgsOptionConfig = {
  readonly type: ParseArgsOptionType;
  readonly short?: string | undefined;
  readonly multiple?: boolean | undefined;
};

export async function parseCommandArgs<
  TArgsFields extends readonly CommandArgField[],
  TOptionsFields extends readonly CommandOptionField[],
>(
  command: DefinedCommand<TArgsFields, TOptionsFields>,
  rawArgs: readonly string[],
): Promise<
  ParseCommandArgsResult<InferNamedFields<TOptionsFields, true>, InferNamedFields<TArgsFields>>
> {
  const parsed = invokeNodeParseArgs(command.options, rawArgs);
  if (!parsed.ok) {
    return parsed;
  }

  const duplicateError = detectDuplicateOption(command.options, parsed.value.tokens);
  if (duplicateError) {
    return duplicateError;
  }

  const parsedArgs = await parseArgumentFields(command.args, parsed.value.positionals);
  if (!parsedArgs.ok) {
    return parsedArgs;
  }

  const parsedOptions = await parseOptionFields(command.options, parsed.value.values);
  if (!parsedOptions.ok) {
    return parsedOptions;
  }

  return {
    ok: true,
    value: {
      options: addCamelCaseAliases(parsedOptions.value) as InferNamedFields<TOptionsFields, true>,
      args: addCamelCaseAliases(parsedArgs.value) as InferNamedFields<TArgsFields>,
      rawArgs,
    },
  };
}

// ---------------------------------------------------------------------------
// High-level parse flow
// ---------------------------------------------------------------------------

type InvokeNodeParseArgsResult =
  | { readonly ok: true; readonly value: NodeParseArgsResult }
  | ParseFailure;

type FieldRecordResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | ParseFailure;

function invokeNodeParseArgs(
  options: readonly CommandOptionField[],
  rawArgs: readonly string[],
): InvokeNodeParseArgsResult {
  try {
    return {
      ok: true,
      value: parseArgs({
        args: [...rawArgs],
        allowPositionals: true,
        strict: true,
        tokens: true,
        options: buildParseArgsOptions(options),
      }),
    };
  } catch (error) {
    return mapNodeParseArgsError(error);
  }
}

async function parseArgumentFields(
  fields: readonly CommandArgField[],
  positionals: readonly string[],
): Promise<FieldRecordResult> {
  const parsedArgs: Record<string, unknown> = {};

  for (const [index, field] of fields.entries()) {
    const result = await parseArgumentField(field, positionals[index]);

    if (!result.ok) {
      return result;
    }

    if (result.present) {
      parsedArgs[field.name] = result.value;
    }
  }

  if (positionals.length > fields.length) {
    return createUnexpectedArgumentError(positionals[fields.length]);
  }

  return {
    ok: true,
    value: parsedArgs,
  };
}

async function parseOptionFields(
  fields: readonly CommandOptionField[],
  values: NodeParseArgsValues,
): Promise<FieldRecordResult> {
  const parsedOptions: Record<string, unknown> = {};

  for (const field of fields) {
    const result = await resolveOptionField(field, values);

    if (!result.ok) {
      return result;
    }

    if (result.present) {
      parsedOptions[field.name] = result.value;
    }
  }

  return {
    ok: true,
    value: parsedOptions,
  };
}

async function resolveOptionField(
  field: CommandOptionField,
  values: NodeParseArgsValues,
): Promise<ResolveFieldResult> {
  const rawValue = values[field.name];
  const negated = isNegatableOption(field) ? values[negatedOptionName(field.name)] : undefined;

  if (rawValue !== undefined && negated !== undefined) {
    return createConflictingOptionError(field);
  }

  if (negated !== undefined) {
    return {
      ok: true,
      present: true,
      value: false,
    };
  }

  // Values returned by `parseArgs` have already been tokenized and matched to this option.
  if (rawValue !== undefined) {
    if (isMultipleOption(field)) {
      return parseProvidedMultipleOption(field, rawValue);
    }

    return parseProvidedOptionField(field, rawValue);
  }

  const result = await resolveMissingField(field, () => createMissingOptionError(field));

  if (result.ok && !result.present && !isSchemaField(field) && field.type === "boolean") {
    return {
      ok: true,
      present: true,
      value: false,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Negatable boolean options
// ---------------------------------------------------------------------------

function isNegatableOption(field: CommandOptionField): boolean {
  return (
    !isSchemaField(field) &&
    !isEnumField(field) &&
    field.type === "boolean" &&
    field.default === true
  );
}

function isMultipleOption(field: CommandOptionField): boolean {
  return "multiple" in field && field.multiple === true;
}

function negatedOptionName(name: string): string {
  return `no-${name}`;
}

// ---------------------------------------------------------------------------
// Error constructors
// ---------------------------------------------------------------------------

function formatTypeHint(field: CommandOptionField): string {
  if (isSchemaField(field) || isEnumField(field) || field.type === "boolean") {
    return "";
  }

  return ` <${field.type}>`;
}

function formatOptionLabel(field: CommandOptionField): string {
  return `--${field.name}${formatTypeHint(field)}`;
}

function formatArgumentLabel(field: CommandArgField): string {
  return field.name;
}

function createMissingOptionError(field: CommandOptionField): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Missing required option:\n  ${formatOptionLabel(field)}`,
    },
  };
}

function createMissingArgumentError(field: CommandArgField): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Missing required argument:\n  ${formatArgumentLabel(field)}`,
    },
  };
}

function createInvalidOptionError(
  field: CommandOptionField,
  messages: readonly string[],
): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Invalid value for option ${formatOptionLabel(field)}:\n  ${messages.join("\n  ")}`,
    },
  };
}

function createInvalidArgumentError(
  field: CommandArgField,
  messages: readonly string[],
): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Invalid value for argument ${formatArgumentLabel(field)}:\n  ${messages.join("\n  ")}`,
    },
  };
}

function createUnknownOptionError(token: string): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Unknown option "${token}"`,
    },
  };
}

function createDuplicateOptionError(field: CommandOptionField): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Duplicate option "${formatOptionLabel(field)}" is not supported`,
    },
  };
}

function createUnexpectedArgumentError(token: string): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Unexpected argument "${token}"`,
    },
  };
}

function createConflictingOptionError(field: CommandOptionField): ParseFailure {
  return {
    ok: false,
    error: {
      message: `Conflicting options: "--${field.name}" and "--${negatedOptionName(field.name)}" cannot be used together`,
    },
  };
}

// ---------------------------------------------------------------------------
// Field parsing & validation
// ---------------------------------------------------------------------------

function parsePrimitiveValue(
  field: PrimitiveArgField | PrimitiveOptionField,
  rawValue: unknown,
): ParsedFieldValue {
  switch (field.type) {
    case "string":
      if (typeof rawValue !== "string") {
        return {
          ok: false,
          error: {
            message: `Expected string, received ${JSON.stringify(rawValue)}`,
          },
        };
      }

      return {
        ok: true,
        value: rawValue,
      };
    case "number": {
      if (typeof rawValue !== "string") {
        return {
          ok: false,
          error: {
            message: `Expected number, received ${JSON.stringify(rawValue)}`,
          },
        };
      }

      const value = Number(rawValue);

      if (!Number.isFinite(value)) {
        return {
          ok: false,
          error: {
            message: `Expected number, received ${JSON.stringify(rawValue)}`,
          },
        };
      }

      return {
        ok: true,
        value,
      };
    }
    case "boolean": {
      if (typeof rawValue === "boolean") {
        return {
          ok: true,
          value: rawValue,
        };
      }

      if (rawValue === "true") {
        return {
          ok: true,
          value: true,
        };
      }

      if (rawValue === "false") {
        return {
          ok: true,
          value: false,
        };
      }

      return {
        ok: false,
        error: {
          message: `Expected boolean, received ${JSON.stringify(rawValue)}`,
        },
      };
    }
  }
}

async function validateSchemaValue(
  schema: StandardSchemaV1,
  rawValue: unknown,
): Promise<ParsedFieldValue> {
  const result = await schema["~standard"].validate(rawValue);

  if ("value" in result) {
    return {
      ok: true,
      value: result.value,
    };
  }

  if (result.issues?.length) {
    return {
      ok: false,
      error: {
        message: result.issues.map((issue: { message: string }) => issue.message).join("\n"),
      },
    };
  }

  return {
    ok: false,
    error: {
      message: "Schema validation failed",
    },
  };
}

function parseEnumValue(field: EnumField, rawValue: unknown): ParsedFieldValue {
  if (typeof rawValue !== "string") {
    return {
      ok: false,
      error: {
        message: `Expected one of: ${field.values.join(", ")}. Received: ${JSON.stringify(rawValue)}.`,
      },
    };
  }

  const matched = matchEnumValue(field.values, rawValue);

  if (matched === undefined) {
    return {
      ok: false,
      error: {
        message: `Expected one of: ${field.values.join(", ")}. Received: ${JSON.stringify(rawValue)}.`,
      },
    };
  }

  return {
    ok: true,
    value: matched,
  };
}

async function parseProvidedField(
  field: CommandArgField | CommandOptionField,
  rawValue: unknown,
): Promise<ParsedFieldValue> {
  if (isSchemaField(field)) {
    return validateSchemaValue(field.schema, rawValue);
  }

  if (isEnumField(field)) {
    return parseEnumValue(field, rawValue);
  }

  return parsePrimitiveValue(field, rawValue);
}

async function resolveMissingField(
  field: CommandArgField | CommandOptionField,
  missingRequired: () => ParseFailure,
): Promise<ResolveFieldResult> {
  if (!isSchemaField(field)) {
    if (field.default !== undefined) {
      return {
        ok: true,
        present: true,
        value: field.default,
      };
    }

    if (field.required) {
      return missingRequired();
    }

    return {
      ok: true,
      present: false,
    };
  }

  const omittedResult = await validateSchemaValue(field.schema, undefined);

  if (!omittedResult.ok) {
    return missingRequired();
  }

  if (omittedResult.value === undefined) {
    return {
      ok: true,
      present: false,
    };
  }

  return {
    ok: true,
    present: true,
    value: omittedResult.value,
  };
}

async function parseArgumentField(
  field: CommandArgField,
  rawValue: string | undefined,
): Promise<ResolveFieldResult> {
  if (rawValue === undefined) {
    return resolveMissingField(field, () => createMissingArgumentError(field));
  }

  const result = await parseProvidedField(field, rawValue);

  if (!result.ok) {
    return createInvalidArgumentError(field, result.error.message.split("\n"));
  }

  return {
    ok: true,
    present: true,
    value: result.value,
  };
}

async function parseProvidedOptionField(
  field: CommandOptionField,
  rawValue: unknown,
): Promise<ResolveFieldResult> {
  const result = await parseProvidedField(field, rawValue);

  if (!result.ok) {
    return createInvalidOptionError(field, result.error.message.split("\n"));
  }

  return {
    ok: true,
    present: true,
    value: result.value,
  };
}

async function parseProvidedMultipleOption(
  field: CommandOptionField,
  rawValue: unknown,
): Promise<ResolveFieldResult> {
  if (!Array.isArray(rawValue)) {
    return createInvalidOptionError(field, [
      `Expected array, received ${JSON.stringify(rawValue)}`,
    ]);
  }

  if (isSchemaField(field)) {
    // Schema-backed repeatable options validate the collected raw values as one array.
    return parseProvidedOptionField(field, rawValue);
  }

  const values: unknown[] = [];
  const errors: string[] = [];

  for (const [index, item] of rawValue.entries()) {
    const result = await parseProvidedField(field, item);

    if (!result.ok) {
      errors.push(
        ...result.error.message.split("\n").map((message) => `Value #${index + 1}: ${message}`),
      );
      continue;
    }

    values.push(result.value);
  }

  if (errors.length > 0) {
    return createInvalidOptionError(field, errors);
  }

  return {
    ok: true,
    present: true,
    value: values,
  };
}

// ---------------------------------------------------------------------------
// node:util parseArgs adapter
// ---------------------------------------------------------------------------

type NodeParseArgsConfig = {
  readonly args: readonly string[];
  readonly allowPositionals: true;
  readonly strict: true;
  readonly tokens: true;
  readonly options: Record<string, ParseArgsOptionConfig>;
};

type NodeParseArgsResult = ReturnType<typeof parseArgs<NodeParseArgsConfig>>;

type NodeParseArgsValues = NodeParseArgsResult["values"];

type NodeParseArgsToken = NonNullable<NodeParseArgsResult["tokens"]>[number];

function mapNodeParseArgsError(error: unknown): ParseFailure {
  if (!(error instanceof Error)) {
    return {
      ok: false,
      error: {
        message: "Argument parsing failed",
      },
    };
  }

  // `parseArgs` does not currently expose structured unknown-option metadata,
  // so this normalization depends on Node's current error wording.
  const unknownMatch = error.message.match(/Unknown option '([^']+)'/);

  if (unknownMatch) {
    return createUnknownOptionError(unknownMatch[1]);
  }

  return {
    ok: false,
    error: {
      message: error.message,
    },
  };
}

function getOptionParseType(field: CommandOptionField): ParseArgsOptionType {
  if (isSchemaField(field)) {
    return field.flag ? "boolean" : "string";
  }

  // `parseArgs` only understands string and boolean options, so numeric options
  // are parsed as strings and coerced later in `parsePrimitiveValue`.
  return field.type === "boolean" ? "boolean" : "string";
}

function buildParseArgsOptions<TOptionsFields extends readonly CommandOptionField[]>(
  options: TOptionsFields,
): Record<string, ParseArgsOptionConfig> {
  const config: Record<string, ParseArgsOptionConfig> = {};

  for (const field of options) {
    const optionConfig: ParseArgsOptionConfig = {
      type: getOptionParseType(field),
      ...(field.short !== undefined ? { short: field.short } : {}),
      ...(isMultipleOption(field) ? { multiple: true } : {}),
    };

    config[field.name] = optionConfig;

    if (isNegatableOption(field)) {
      config[negatedOptionName(field.name)] = { type: "boolean" };
    }
  }

  return config;
}

function detectDuplicateOption(
  options: readonly CommandOptionField[],
  tokens: readonly NodeParseArgsToken[],
): ParseFailure | undefined {
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (token.kind !== "option" || !token.name) {
      continue;
    }

    const nextCount = (counts.get(token.name) ?? 0) + 1;
    counts.set(token.name, nextCount);

    if (nextCount > 1) {
      const field = options.find((option) => option.name === token.name);

      if (field) {
        if (isMultipleOption(field)) {
          continue;
        }

        return createDuplicateOptionError(field);
      }

      // Check if this is a duplicate negation (e.g. --no-color --no-color)
      const negatedField = options.find(
        (option) => isNegatableOption(option) && negatedOptionName(option.name) === token.name,
      );

      if (negatedField) {
        return {
          ok: false,
          error: {
            message: `Duplicate option "--${negatedOptionName(negatedField.name)}" is not supported`,
          },
        };
      }
    }
  }

  return undefined;
}
