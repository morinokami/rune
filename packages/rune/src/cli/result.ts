import type { CommandExecutionResult } from "@rune-cli/core";

export function successResult(stdout: string): CommandExecutionResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
  };
}

export function failureResult(stderr: string): CommandExecutionResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
  };
}
