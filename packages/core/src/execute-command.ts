import type {
  CommandArgField,
  CommandOptionField,
  DefinedCommand,
  InferExecutionFields,
  InferNamedFields,
} from "./command-types";

import { addCamelCaseAliases, normalizeToCanonicalKeys } from "./camel-case-aliases";
import { isSchemaField } from "./schema-field";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// Input accepted by the low-level direct executor before validation exists.
export interface ExecuteCommandInput<TOptions, TArgs> {
  readonly options?: TOptions | undefined;
  readonly args?: TArgs | undefined;
  readonly cwd?: string | undefined;
  readonly rawArgs?: readonly string[] | undefined;
}

// The normalized result of running a command without spawning a process.
export interface ExecuteCommandResult {
  readonly exitCode: number;
  readonly errorMessage?: string | undefined;
}

// ---------------------------------------------------------------------------
// Execution helpers
// ---------------------------------------------------------------------------

function formatExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "" ? "" : error.message || error.name || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function createExecutionOptions<TOptionsFields extends readonly CommandOptionField[]>(
  command: DefinedCommand<readonly CommandArgField[], TOptionsFields>,
  input: ExecuteCommandInput<InferExecutionFields<TOptionsFields>, unknown>,
): InferNamedFields<TOptionsFields, true> {
  const options: Record<string, unknown> = { ...input.options };

  normalizeToCanonicalKeys(command.options, options);

  for (const field of command.options) {
    if (options[field.name] === undefined && !isSchemaField(field) && field.type === "boolean") {
      options[field.name] = false;
    }
  }

  return options as InferNamedFields<TOptionsFields, true>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// This is a low-level executor intended to sit below future validation helpers.
export async function executeCommand<
  TArgsFields extends readonly CommandArgField[],
  TOptionsFields extends readonly CommandOptionField[],
>(
  command: DefinedCommand<TArgsFields, TOptionsFields>,
  input: ExecuteCommandInput<
    InferExecutionFields<TOptionsFields>,
    InferExecutionFields<TArgsFields>
  > = {},
): Promise<ExecuteCommandResult> {
  try {
    await command.run({
      options: addCamelCaseAliases(
        createExecutionOptions(command, input) as Record<string, unknown>,
      ) as InferNamedFields<TOptionsFields, true>,
      args: addCamelCaseAliases(
        normalizeToCanonicalKeys(command.args, { ...input.args } as Record<string, unknown>),
      ) as InferNamedFields<TArgsFields>,
      cwd: input.cwd ?? process.cwd(),
      rawArgs: input.rawArgs ?? [],
    });

    return { exitCode: 0 };
  } catch (error) {
    const message = formatExecutionError(error);

    return message ? { exitCode: 1, errorMessage: message } : { exitCode: 1 };
  }
}
