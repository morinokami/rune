import {
  executeCommand,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
  type ExecuteCommandInput,
  type InferExecutionFields,
} from "@rune-cli/core";

import { captureProcessOutput } from "./capture-output";

export type RunCommandOptions<TOptions, TArgs> = ExecuteCommandInput<TOptions, TArgs>;

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string | undefined;
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
  const captured = await captureProcessOutput(() => executeCommand(command, options));

  if (!captured.ok) {
    throw captured.error;
  }

  return {
    exitCode: captured.value.exitCode,
    stdout: captured.stdout,
    stderr: captured.stderr,
    errorMessage: captured.value.errorMessage,
  };
}
