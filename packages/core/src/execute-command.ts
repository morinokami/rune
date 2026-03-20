import type {
  CommandArgField,
  CommandOptionField,
  DefinedCommand,
  InferExecutionFields,
  InferNamedFields,
} from "./command-types";

import { captureProcessOutput, formatExecutionError } from "./internal/capture-output";

// Input accepted by the low-level direct executor before validation exists.
export interface ExecuteCommandInput<TOptions, TArgs> {
  readonly options?: TOptions | undefined;
  readonly args?: TArgs | undefined;
  readonly cwd?: string | undefined;
  readonly rawArgs?: readonly string[] | undefined;
}

// The normalized result of running a command without spawning a process.
export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const EMPTY_ARGS = [] as const;

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
): Promise<CommandExecutionResult> {
  const result = await captureProcessOutput(async () => {
    await command.run({
      options: (input.options ?? {}) as InferNamedFields<TOptionsFields>,
      args: (input.args ?? {}) as InferNamedFields<TArgsFields>,
      cwd: input.cwd ?? process.cwd(),
      rawArgs: input.rawArgs ?? EMPTY_ARGS,
    });
  });

  if (result.error === undefined) {
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  const message = formatExecutionError(result.error);

  return {
    exitCode: 1,
    stdout: result.stdout,
    stderr: `${result.stderr}${message ? `${message}\n` : ""}`,
  };
}
