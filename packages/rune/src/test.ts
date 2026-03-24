import {
  captureProcessOutput,
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
}

// Runs a command definition directly in-process for command-level tests.
// This helper bypasses Rune's parser and validation layers, so callers inject
// already-normalized `options` and `args` values directly.
// Output is captured so tests can assert on stdout and stderr.
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

  if (captured.error !== undefined || captured.value === undefined) {
    throw captured.error ?? new Error("executeCommand did not return a result");
  }

  return {
    exitCode: captured.value.exitCode,
    stdout: captured.stdout,
    stderr: `${captured.stderr}${captured.value.errorMessage ? `${captured.value.errorMessage}\n` : ""}`,
  };
}
