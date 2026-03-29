import type { StandardSchemaV1 } from "@standard-schema/spec";

import { parseArgs } from "node:util";

import type {
  CommandArgField,
  CommandOptionField,
  DefinedCommand,
  InferNamedFields,
} from "./command-types";

import { addCamelCaseAliases } from "./camel-case-aliases";
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

type SuccessfulFieldParse =
  | { readonly ok: true; readonly present: true; readonly value: unknown }
  | { readonly ok: true; readonly present: false };

type FailedFieldParse = {
  readonly ok: false;
  readonly error: ParseCommandArgsError;
};

type FieldParseResult = SuccessfulFieldParse | FailedFieldParse;

type SchemaValidationResult = { readonly ok: true; readonly value: unknown } | FailedFieldParse;

type ParseArgsOptionType = "boolean" | "string";

type ParseArgsOptionConfig = {
  readonly type: ParseArgsOptionType;
  readonly short?: string | undefined;
};

type TokenizedParseArgsConfig = {
  readonly args: readonly string[];
  readonly allowPositionals: true;
  readonly strict: true;
  readonly tokens: true;
  readonly options: Record<string, ParseArgsOptionConfig>;
};

type TokenizedParseArgsResult = ReturnType<typeof parseArgs<TokenizedParseArgsConfig>>;

type ParseArgsToken = NonNullable<TokenizedParseArgsResult["tokens"]>[number];

// ---------------------------------------------------------------------------
// Error constructors
// ---------------------------------------------------------------------------

function formatTypeHint(field: CommandOptionField): string {
  return isSchemaField(field) ? "" : ` <${field.type}>`;
}

function formatOptionLabel(field: CommandOptionField): string {
  return `--${field.name}${formatTypeHint(field)}`;
}

function formatArgumentLabel(field: CommandArgField): string {
  return field.name;
}

function createMissingOptionError(field: CommandOptionField): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Missing required option:\n\n  ${formatOptionLabel(field)}`,
    },
  };
}

function createMissingArgumentError(field: CommandArgField): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Missing required argument:\n\n  ${formatArgumentLabel(field)}`,
    },
  };
}

function createInvalidOptionError(
  field: CommandOptionField,
  messages: readonly string[],
): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Invalid value for option ${formatOptionLabel(field)}:\n\n  ${messages.join("\n  ")}`,
    },
  };
}

function createInvalidArgumentError(
  field: CommandArgField,
  messages: readonly string[],
): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Invalid value for argument ${formatArgumentLabel(field)}:\n\n  ${messages.join("\n  ")}`,
    },
  };
}

function createUnknownOptionError(token: string): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Unknown option "${token}"`,
    },
  };
}

function createDuplicateOptionError(field: CommandOptionField): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Duplicate option "${formatOptionLabel(field)}" is not supported`,
    },
  };
}

function createUnexpectedArgumentError(token: string): FailedFieldParse {
  return {
    ok: false,
    error: {
      message: `Unexpected argument "${token}"`,
    },
  };
}

// ---------------------------------------------------------------------------
// Field parsing & validation
// ---------------------------------------------------------------------------

function parsePrimitiveValue(
  field: CommandArgField | CommandOptionField,
  rawValue: unknown,
): SchemaValidationResult {
  if (isSchemaField(field)) {
    throw new Error("Schema fields must be handled separately");
  }

  switch (field.type) {
    case "string":
      return {
        ok: true,
        value: String(rawValue),
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
): Promise<SchemaValidationResult> {
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

async function parseProvidedField(
  field: CommandArgField | CommandOptionField,
  rawValue: unknown,
): Promise<SchemaValidationResult> {
  if (isSchemaField(field)) {
    return validateSchemaValue(field.schema, rawValue);
  }

  return parsePrimitiveValue(field, rawValue);
}

async function resolveMissingField(
  field: CommandArgField | CommandOptionField,
  missingRequired: () => FailedFieldParse,
): Promise<FieldParseResult> {
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
): Promise<FieldParseResult> {
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

async function parseOptionField(
  field: CommandOptionField,
  rawValue: unknown,
): Promise<FieldParseResult> {
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

// ---------------------------------------------------------------------------
// node:util parseArgs adapter
// ---------------------------------------------------------------------------

function normalizeParseArgsError(error: unknown): FailedFieldParse {
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
    config[field.name] = field.short
      ? {
          type: getOptionParseType(field),
          short: field.short,
        }
      : {
          type: getOptionParseType(field),
        };
  }

  return config;
}

function detectDuplicateOption(
  options: readonly CommandOptionField[],
  tokens: readonly ParseArgsToken[],
): FailedFieldParse | undefined {
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
        return createDuplicateOptionError(field);
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function parseCommandArgs<
  TArgsFields extends readonly CommandArgField[],
  TOptionsFields extends readonly CommandOptionField[],
>(
  command: DefinedCommand<TArgsFields, TOptionsFields>,
  rawArgs: readonly string[],
): Promise<
  ParseCommandArgsResult<InferNamedFields<TOptionsFields, true>, InferNamedFields<TArgsFields>>
> {
  let parsed: TokenizedParseArgsResult | undefined;

  try {
    parsed = parseArgs({
      args: [...rawArgs],
      allowPositionals: true,
      strict: true,
      tokens: true,
      options: buildParseArgsOptions(command.options),
    });
  } catch (error) {
    return normalizeParseArgsError(error);
  }

  const duplicateError = detectDuplicateOption(command.options, parsed.tokens);

  if (duplicateError) {
    return duplicateError;
  }

  const parsedArgs: Record<string, unknown> = {};
  const parsedOptions: Record<string, unknown> = {};

  for (let index = 0; index < command.args.length; index += 1) {
    const field = command.args[index];
    const result = await parseArgumentField(field, parsed.positionals[index]);

    if (!result.ok) {
      return result;
    }

    if (result.present) {
      parsedArgs[field.name] = result.value;
    }
  }

  if (parsed.positionals.length > command.args.length) {
    return createUnexpectedArgumentError(parsed.positionals[command.args.length]);
  }

  for (const field of command.options) {
    const rawValue = parsed.values[field.name];

    // Values returned by `parseArgs` have already been tokenized and matched to this option.
    if (rawValue !== undefined) {
      const result = await parseOptionField(field, rawValue);

      if (!result.ok) {
        return result;
      }

      if (result.present) {
        parsedOptions[field.name] = result.value;
      }

      continue;
    }

    const result = await resolveMissingField(field, () => createMissingOptionError(field));

    if (!result.ok) {
      return result;
    }

    if (result.present) {
      parsedOptions[field.name] = result.value;
    } else if (!isSchemaField(field) && field.type === "boolean") {
      parsedOptions[field.name] = false;
    }
  }

  return {
    ok: true,
    value: {
      options: addCamelCaseAliases(parsedOptions) as InferNamedFields<TOptionsFields, true>,
      args: addCamelCaseAliases(parsedArgs) as InferNamedFields<TArgsFields>,
      rawArgs,
    },
  };
}
