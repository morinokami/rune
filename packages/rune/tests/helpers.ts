import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { format } from "node:util";
import { afterEach, vi } from "vite-plus/test";

import type {
  CommandManifest,
  CommandManifestCommandNode,
  CommandManifestGroupNode,
} from "../src/manifest/manifest-types";

import { runRuneCli } from "../src/cli/rune-cli";

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

// Convenience: create a manager and register its cleanup with `afterEach` so
// each test file can drop the hand-written `afterEach(() => manager.cleanup())`.
export function setupTempFixtures(): TempFixtureManager {
  const manager = createTempFixtureManager();
  afterEach(async () => {
    await manager.cleanup();
  });
  return manager;
}

// Convenience for generate-manifest tests: creates fixtures under `src/commands`.
export function setupCommandsFixtures(): {
  readonly createCommandsFixture: (files: FixtureFiles) => Promise<string>;
} {
  const manager = setupTempFixtures();
  const createCommandsFixture = async (files: FixtureFiles): Promise<string> => {
    const { fixtureDirectory } = await manager.createFixture({
      fixturePath: path.join("src", "commands"),
      files,
    });
    return fixtureDirectory;
  };
  return { createCommandsFixture };
}

// ---------------------------------------------------------------------------
// Manifest node builders
// ---------------------------------------------------------------------------

export function groupNode(input: {
  readonly pathSegments: readonly string[];
  readonly childNames: readonly string[];
  readonly aliases?: readonly string[];
  readonly description?: string;
  readonly examples?: readonly string[];
}): CommandManifestGroupNode {
  const node: CommandManifestGroupNode = {
    pathSegments: input.pathSegments,
    kind: "group",
    aliases: input.aliases ?? [],
    childNames: input.childNames,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.examples !== undefined ? { examples: input.examples } : {}),
  };
  return node;
}

export function commandNode(input: {
  readonly pathSegments: readonly string[];
  readonly sourceFilePath: string;
  readonly childNames?: readonly string[];
  readonly aliases?: readonly string[];
  readonly description?: string;
  readonly examples?: readonly string[];
}): CommandManifestCommandNode {
  return {
    pathSegments: input.pathSegments,
    kind: "command",
    sourceFilePath: input.sourceFilePath,
    aliases: input.aliases ?? [],
    childNames: input.childNames ?? [],
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.examples !== undefined ? { examples: input.examples } : {}),
  };
}

export function manifest(
  nodes: ReadonlyArray<CommandManifestCommandNode | CommandManifestGroupNode>,
): CommandManifest {
  return { nodes };
}

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

export interface CapturedCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Runs an action that returns an exit code, capturing stdout and stderr via
// vi.spyOn so teardown is handled by vitest's mock restoration machinery.
// Not concurrency-safe (patches shared process/console state); safe for the
// default sequential-within-file vitest execution model.
export async function captureCommandResult(
  action: () => Promise<number>,
): Promise<CapturedCommandResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const pushChunk = (chunks: string[], chunk: string | Uint8Array, encoding?: BufferEncoding) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(encoding));
  };

  const writeSpy =
    (chunks: string[]) =>
    (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      cb?: (error?: Error | null) => void,
    ): boolean => {
      pushChunk(chunks, chunk, typeof encoding === "string" ? encoding : undefined);
      if (typeof encoding === "function") {
        encoding(null);
      } else {
        cb?.(null);
      }
      return true;
    };

  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(writeSpy(stdoutChunks) as typeof process.stdout.write);
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(writeSpy(stderrChunks) as typeof process.stderr.write);

  const consoleSpies = [
    vi.spyOn(console, "log").mockImplementation((...args) => {
      stdoutChunks.push(`${format(...args)}\n`);
    }),
    vi.spyOn(console, "info").mockImplementation((...args) => {
      stdoutChunks.push(`${format(...args)}\n`);
    }),
    vi.spyOn(console, "debug").mockImplementation((...args) => {
      stdoutChunks.push(`${format(...args)}\n`);
    }),
    vi.spyOn(console, "warn").mockImplementation((...args) => {
      stderrChunks.push(`${format(...args)}\n`);
    }),
    vi.spyOn(console, "error").mockImplementation((...args) => {
      stderrChunks.push(`${format(...args)}\n`);
    }),
  ];

  try {
    const exitCode = await action();
    return {
      exitCode,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
  }
}

export async function captureRuneCliResult(
  argv: readonly string[],
  cwd?: string,
): Promise<CapturedCommandResult> {
  return captureCommandResult(() => runRuneCli({ argv, cwd }));
}
