import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";
import type {
  ProjectCliInfo,
  ProjectDirectories,
  ProjectPackageJson,
} from "../project/project-files";
import type { ExternalDependenciesContext } from "./rolldown-shared";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import {
  applyProjectCliInfoOverrides,
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  readProjectPackageJson,
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { loadRuneConfigSafe } from "../runtime/load-rune-config";
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
// Public API
// ---------------------------------------------------------------------------

export async function runBuildCommand(options: RunBuildCommandOptions): Promise<number> {
  let projectRoot = "";

  try {
    projectRoot = resolveProjectPath(options);
    const context = await createBuildCommandContext(projectRoot);
    const { sourceDirectory, commandsDirectory, distDirectory } = context.directories;

    await assertCommandsDirectoryExists(commandsDirectory);
    const sourceManifest = await generateCommandManifest({ commandsDirectory });
    const builtManifest = createBuiltManifest(sourceManifest, sourceDirectory);

    await rm(distDirectory, { recursive: true, force: true });
    await writeBuiltRuntimeFiles(distDirectory, builtManifest);
    const configBuildPromise = context.configPath
      ? buildConfigEntry(
          projectRoot,
          distDirectory,
          context.configPath,
          context.externalDependencies,
        )
      : Promise.resolve(undefined);
    const backgroundBuilds = Promise.all([
      buildCommandEntries(
        projectRoot,
        sourceDirectory,
        distDirectory,
        sourceManifest,
        context.externalDependencies,
      ),
      copyBuiltAssets(sourceDirectory, distDirectory),
    ]);
    // Avoid unhandled rejections while waiting for config metadata.
    void backgroundBuilds.catch(() => undefined);

    const builtConfigPath = await configBuildPromise;
    const config = builtConfigPath
      ? await loadRuneConfigSafe(builtConfigPath, { label: "built rune.config.ts" })
      : undefined;
    const cliInfo = applyProjectCliInfoOverrides(context.packageCliInfo, config);

    await Promise.all([
      backgroundBuilds,
      buildCliEntry(distDirectory, cliInfo.name, cliInfo.version, context.configPath !== undefined),
    ]);
    for (const warning of getRuntimeDependencyWarnings(
      context.packageJson,
      context.externalDependencies.getExternalPackages(),
    )) {
      await writeStderrLine(warning);
    }

    await writeStdout(`Built CLI to ${path.join(distDirectory, BUILD_CLI_FILENAME)}\n`);
    return 0;
  } catch (error) {
    return reportBuildCommandError(projectRoot, error);
  }
}

interface BuildCommandContext {
  readonly directories: ProjectDirectories;
  readonly packageCliInfo: ProjectCliInfo;
  readonly packageJson?: ProjectPackageJson | undefined;
  readonly configPath?: string | undefined;
  readonly externalDependencies: ExternalDependenciesContext;
}

async function createBuildCommandContext(projectRoot: string): Promise<BuildCommandContext> {
  return {
    directories: resolveProjectDirectories(projectRoot),
    packageCliInfo: await readProjectCliInfo(projectRoot),
    packageJson: await readProjectPackageJson(projectRoot),
    configPath: await resolveConfigPath(projectRoot),
    externalDependencies: createExternalDependenciesContext(),
  };
}

async function reportBuildCommandError(projectRoot: string, error: unknown): Promise<number> {
  if (isBuildFailure(error)) {
    await writeStderrLine(formatBuildFailure(projectRoot, error));
    return 1;
  }

  await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune build");
  return 1;
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
