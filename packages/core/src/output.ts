import { format } from "node:util";

/** Framework-owned output API for command-authored text. */
export interface CommandOutput {
  /** Human-readable stdout output. Suppressed in JSON mode. */
  log(...args: unknown[]): void;

  /** Diagnostic stderr output. Never suppressed by JSON mode. */
  error(...args: unknown[]): void;
}

/** Pluggable destination for formatted output strings. */
export interface OutputSink {
  stdout(message: string): void;
  stderr(message: string): void;
}

export function createOutput(
  sink: OutputSink,
  options?: { silentStdout?: boolean },
): CommandOutput {
  const silentStdout = options?.silentStdout ?? false;

  return {
    log(...args: unknown[]) {
      if (!silentStdout) {
        sink.stdout(`${format(...args)}\n`);
      }
    },

    error(...args: unknown[]) {
      sink.stderr(`${format(...args)}\n`);
    },
  };
}
