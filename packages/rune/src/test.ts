import {
  executeCommand,
  type CommandArgField,
  type CommandExecutionResult,
  type CommandOptionField,
  type DefinedCommand,
  type ExecuteCommandInput,
  type InferExecutionFields,
} from "@rune-cli/core";

export type RunCommandOptions<TOptions, TArgs> = ExecuteCommandInput<TOptions, TArgs>;

// Runs a command definition directly in-process for command-level tests.
// This helper bypasses Rune's parser and validation layers, so callers inject
// already-normalized `options` and `args` values directly.
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
  return executeCommand(command, options);
}
