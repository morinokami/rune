import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import {
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  resolveCommandsDirectory,
  resolveConfigPath,
  resolveDistDirectory,
  resolveProjectPath,
  resolveSourceDirectory,
} from "../project/project-files";
import { toPosixPath } from "./path-utils";
import {
  BUILD_CLI_FILENAME,
  BUILD_MANIFEST_FILENAME,
  buildCliEntry,
  buildCommandEntries,
  buildConfigEntry,
  formatBuildFailure,
  isBuildFailure,
} from "./rolldown-build";
import { writeStderrLine, writeStdout } from "./write-result";

export interface RunBuildCommandOptions {
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

const CODE_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
// ---------------------------------------------------------------------------
// Manifest & path helpers
// ---------------------------------------------------------------------------

function isCodeSourceFile(filePath: string): boolean {
  return CODE_SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isDeclarationFile(filePath: string): boolean {
  return filePath.endsWith(".d.ts") || filePath.endsWith(".d.mts") || filePath.endsWith(".d.cts");
}

function replaceFileExtension(filePath: string, extension: string): string {
  const parsedPath = path.parse(filePath);
  return path.join(parsedPath.dir, `${parsedPath.name}${extension}`);
}

function createBuiltManifest(manifest: CommandManifest, sourceDirectory: string): CommandManifest {
  return {
    nodes: manifest.nodes.map((node) => {
      if (node.kind !== "command") {
        return node;
      }

      const relativeSourceFilePath = path.relative(sourceDirectory, node.sourceFilePath);

      return {
        ...node,
        sourceFilePath: toPosixPath(replaceFileExtension(relativeSourceFilePath, ".mjs")),
      } satisfies CommandManifestCommandNode;
    }),
  };
}

async function copyBuiltAssets(sourceDirectory: string, distDirectory: string): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourceEntryPath = path.join(sourceDirectory, entry.name);
      const distEntryPath = path.join(distDirectory, entry.name);

      if (entry.isDirectory()) {
        await copyBuiltAssets(sourceEntryPath, distEntryPath);
        return;
      }

      if (isDeclarationFile(sourceEntryPath)) {
        return;
      }

      if (isCodeSourceFile(sourceEntryPath)) {
        return;
      }

      await mkdir(path.dirname(distEntryPath), { recursive: true });
      await cp(sourceEntryPath, distEntryPath);
    }),
  );
}

async function writeBuiltRuntimeFiles(
  distDirectory: string,
  manifest: CommandManifest,
): Promise<void> {
  await mkdir(distDirectory, { recursive: true });
  await writeFile(
    path.join(distDirectory, BUILD_MANIFEST_FILENAME),
    serializeCommandManifest(manifest),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function runBuildCommand(options: RunBuildCommandOptions): Promise<number> {
  let projectRoot = "";

  try {
    projectRoot = resolveProjectPath(options);
    const sourceDirectory = resolveSourceDirectory(projectRoot);
    const commandsDirectory = resolveCommandsDirectory(projectRoot);
    const distDirectory = resolveDistDirectory(projectRoot);

    await assertCommandsDirectoryExists(commandsDirectory);
    const sourceManifest = await generateCommandManifest({ commandsDirectory });
    const builtManifest = createBuiltManifest(sourceManifest, sourceDirectory);
    const cliInfo = await readProjectCliInfo(projectRoot);
    const configPath = await resolveConfigPath(projectRoot);

    await rm(distDirectory, { recursive: true, force: true });
    await writeBuiltRuntimeFiles(distDirectory, builtManifest);
    await Promise.all([
      buildCommandEntries(projectRoot, sourceDirectory, distDirectory, sourceManifest),
      buildCliEntry(distDirectory, cliInfo.name, cliInfo.version, configPath !== undefined),
      ...(configPath ? [buildConfigEntry(projectRoot, distDirectory, configPath)] : []),
      copyBuiltAssets(sourceDirectory, distDirectory),
    ]);

    await writeStdout(`Built CLI to ${path.join(distDirectory, BUILD_CLI_FILENAME)}\n`);
    return 0;
  } catch (error) {
    if (isBuildFailure(error)) {
      await writeStderrLine(formatBuildFailure(projectRoot, error));
      return 1;
    }

    await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune build");
    return 1;
  }
}
