import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import {
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  readProjectPackageJson,
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { copyBuiltAssets } from "./copy-assets";
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
import { createExternalDependenciesContext } from "./rolldown-shared";
import { getRuntimeDependencyWarnings } from "./runtime-dependency-warnings";
import { writeStderrLine, writeStdout } from "./write-result";

export interface RunBuildCommandOptions {
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

// ---------------------------------------------------------------------------
// Manifest & path helpers
// ---------------------------------------------------------------------------

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
    const { sourceDirectory, commandsDirectory, distDirectory } =
      resolveProjectDirectories(projectRoot);

    await assertCommandsDirectoryExists(commandsDirectory);
    const sourceManifest = await generateCommandManifest({ commandsDirectory });
    const builtManifest = createBuiltManifest(sourceManifest, sourceDirectory);
    const cliInfo = await readProjectCliInfo(projectRoot);
    const packageJson = await readProjectPackageJson(projectRoot);
    const configPath = await resolveConfigPath(projectRoot);
    const externalDependenciesContext = createExternalDependenciesContext();

    await rm(distDirectory, { recursive: true, force: true });
    await writeBuiltRuntimeFiles(distDirectory, builtManifest);
    await Promise.all([
      buildCommandEntries(
        projectRoot,
        sourceDirectory,
        distDirectory,
        sourceManifest,
        externalDependenciesContext,
      ),
      buildCliEntry(distDirectory, cliInfo.name, cliInfo.version, configPath !== undefined),
      ...(configPath
        ? [buildConfigEntry(projectRoot, distDirectory, configPath, externalDependenciesContext)]
        : []),
      copyBuiltAssets(sourceDirectory, distDirectory),
    ]);
    for (const warning of getRuntimeDependencyWarnings(
      packageJson,
      externalDependenciesContext.getExternalPackages(),
    )) {
      await writeStderrLine(warning);
    }

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
