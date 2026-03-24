import { captureProcessOutput } from "@rune-cli/core";

export interface CapturedExitCode {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Runs an action that returns an exit code, capturing stdout and stderr.
// Throws if the action itself throws (not if it returns a non-zero exit code).
export async function captureExitCode(action: () => Promise<number>): Promise<CapturedExitCode> {
  const captured = await captureProcessOutput(action);

  if (!captured.ok) {
    throw captured.error;
  }

  return { exitCode: captured.value, stdout: captured.stdout, stderr: captured.stderr };
}
