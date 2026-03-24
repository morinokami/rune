import { format } from "node:util";

// Result of capturing process output around an in-process command execution.
export type CapturedOutput<TValue> =
  | { readonly ok: true; readonly value: TValue; readonly stdout: string; readonly stderr: string }
  | {
      readonly ok: false;
      readonly error: unknown;
      readonly stdout: string;
      readonly stderr: string;
    };

// Captures process output by temporarily patching stdout, stderr, and console.
// Used by test helpers (`runCommand`) to assert on command output.
// TODO: Not concurrency-safe because it patches global process and console state.
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
      ok: true,
      value,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } catch (error) {
    return {
      ok: false,
      error,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    Object.assign(console, originalConsoleMethods);
  }
}
