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
  stdout(message: string): void | Promise<void>;
  stderr(message: string): void | Promise<void>;
}

export function createOutput(
  sink: OutputSink,
  options?: { silentStdout?: boolean },
): CommandOutput {
  const silentStdout = options?.silentStdout ?? false;

  return {
    log(...args: unknown[]) {
      if (!silentStdout) {
        writeAndIgnoreErrors(sink.stdout(`${format(...args)}\n`));
      }
    },

    error(...args: unknown[]) {
      writeAndIgnoreErrors(sink.stderr(`${format(...args)}\n`));
    },
  };
}

function writeAndIgnoreErrors(result: void | Promise<void>): void {
  if (result && typeof result === "object" && "catch" in result) {
    result.catch(() => {});
  }
}
