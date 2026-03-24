import type {
  CommandArgField,
  CommandOptionField,
  DefinedCommand,
  InferExecutionFields,
  InferNamedFields,
} from "./command-types";

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

function formatExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "" ? "" : error.message || error.name || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

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
      options: (input.options ?? {}) as InferNamedFields<TOptionsFields>,
      args: (input.args ?? {}) as InferNamedFields<TArgsFields>,
      cwd: input.cwd ?? process.cwd(),
      rawArgs: input.rawArgs ?? [],
    });

    return { exitCode: 0 };
  } catch (error) {
    const message = formatExecutionError(error);

    return message ? { exitCode: 1, errorMessage: message } : { exitCode: 1 };
  }
}
