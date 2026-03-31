import {
  createOutput,
  executeCommand,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
  type ExecuteCommandInput,
  type InferExecutionFields,
} from "@rune-cli/core";

export type RunCommandOptions<TOptions, TArgs> = ExecuteCommandInput<TOptions, TArgs>;

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string | undefined;
  readonly data?: unknown;
}

export async function runCommand<
  TArgsFields extends readonly CommandArgField[],
  TOptionsFields extends readonly CommandOptionField[],
>(
  command: DefinedCommand<TArgsFields, TOptionsFields>,
  options: RunCommandOptions<
    InferExecutionFields<TOptionsFields>,
    InferExecutionFields<TArgsFields>
  > = {},
): Promise<CommandExecutionResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const output = createOutput(
    {
      stdout: (message) => stdoutChunks.push(message),
      stderr: (message) => stderrChunks.push(message),
    },
    { silentStdout: options.jsonMode === true },
  );

  const result = await executeCommand(command, {
    ...options,
    output,
  });

  return {
    exitCode: result.exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    errorMessage: result.errorMessage,
    data: result.data,
  };
}
