import { format } from "node:util";

// Result of capturing process output around an in-process command execution.
export interface CapturedOutput<TValue> {
  readonly stdout: string;
  readonly stderr: string;
  readonly value?: TValue;
  readonly error?: unknown;
}

// Converts a thrown value into deterministic stderr text.
export function formatExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "" ? "" : error.message || error.name || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

// TODO: Replace this temporary implementation once `runCommand` / `rune/test`
// output semantics are designed. It is not concurrency-safe because it patches
// global process and console state.
export async function captureProcessOutput<TValue>(
  action: () => Promise<TValue>,
): Promise<CapturedOutput<TValue>> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleMethods = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
  };

  const captureChunk = (
    chunks: string[],
    chunk: string | Uint8Array,
    encoding?: BufferEncoding,
  ) => {
    if (typeof chunk === "string") {
      chunks.push(chunk);
      return;
    }

    chunks.push(Buffer.from(chunk).toString(encoding));
  };

  const captureConsole = (chunks: string[], args: unknown[]) => {
    chunks.push(`${format(...args)}\n`);
  };

  const createWriteCapture = (chunks: string[]) =>
    ((
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      cb?: (error?: Error | null) => void,
    ) => {
      captureChunk(chunks, chunk, typeof encoding === "string" ? encoding : undefined);
      if (typeof encoding === "function") {
        encoding(null);
      } else {
        cb?.(null);
      }
      return true;
    }) as typeof process.stdout.write;

  process.stdout.write = createWriteCapture(stdoutChunks);
  process.stderr.write = createWriteCapture(stderrChunks);

  for (const method of ["log", "info", "debug"] as const) {
    console[method] = (...args: unknown[]) => captureConsole(stdoutChunks, args);
  }

  for (const method of ["warn", "error"] as const) {
    console[method] = (...args: unknown[]) => captureConsole(stderrChunks, args);
  }

  try {
    const value = await action();

    return {
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      value,
    };
  } catch (error) {
    return {
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      error,
    };
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    Object.assign(console, originalConsoleMethods);
  }
}
