import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { format } from "node:util";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

export type FixtureFiles = Readonly<Record<string, string>>;

export interface TempFixtureManager {
  createRoot(): Promise<string>;
  createFixture(options: { readonly files: FixtureFiles; readonly fixturePath?: string }): Promise<{
    readonly rootDirectory: string;
    readonly fixtureDirectory: string;
  }>;
  cleanup(): Promise<void>;
}

export async function writeFixtureFiles(rootDirectory: string, files: FixtureFiles): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(rootDirectory, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );
}

export async function pathExists(entryPath: string): Promise<boolean> {
  try {
    await stat(entryPath);
    return true;
  } catch {
    return false;
  }
}

export function createTempFixtureManager(): TempFixtureManager {
  const rootDirectories = new Set<string>();

  const createRoot = async (): Promise<string> => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "rune-test-"));
    rootDirectories.add(rootDirectory);
    return rootDirectory;
  };

  const createFixture = async ({
    files,
    fixturePath,
  }: {
    readonly files: FixtureFiles;
    readonly fixturePath?: string;
  }) => {
    const rootDirectory = await createRoot();
    const fixtureDirectory =
      fixturePath === undefined ? rootDirectory : path.join(rootDirectory, fixturePath);

    await mkdir(fixtureDirectory, { recursive: true });
    await writeFixtureFiles(fixtureDirectory, files);

    return { rootDirectory, fixtureDirectory };
  };

  const cleanup = async (): Promise<void> => {
    await Promise.all(
      [...rootDirectories].map((rootDirectory) =>
        rm(rootDirectory, { recursive: true, force: true }),
      ),
    );
    rootDirectories.clear();
  };

  return { createRoot, createFixture, cleanup };
}

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

export interface CapturedCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// TODO: Not concurrency-safe because it patches global process and console state.
// Runs an action that returns an exit code, capturing stdout and stderr.
// Throws if the action itself throws (not if it returns a non-zero exit code).
export async function captureCommandResult(
  action: () => Promise<number>,
): Promise<CapturedCommandResult> {
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
    const exitCode = await action();

    return {
      exitCode,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
    Object.assign(console, originalConsoleMethods);
  }
}
