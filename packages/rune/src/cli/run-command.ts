import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import {
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { isVersionFlag } from "../routing/framework-flags";
import { resolveCommandRoute } from "../routing/resolve-command-route";
import { runManifestCommand } from "../runtime/run-manifest-command";
import {
  bundleCommandForRun,
  bundleConfigForRun,
  copyRunAssets,
  prepareRunDirectory,
} from "./bundle-for-run";
import { formatBuildFailure, isBuildFailure } from "./rolldown-shared";
import { writeStderrLine, writeStdout } from "./write-result";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const RUN_MANIFEST_DIRECTORY_PATH = ".rune";
const RUN_MANIFEST_FILENAME = "manifest.json";

export interface RunRunCommandOptions {
  readonly rawArgs: readonly string[];
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

async function writeRunManifest(projectRoot: string, manifestContents: string): Promise<void> {
  const manifestDirectory = path.join(projectRoot, RUN_MANIFEST_DIRECTORY_PATH);
  const manifestPath = path.join(manifestDirectory, RUN_MANIFEST_FILENAME);

  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(manifestPath, manifestContents);
}

function replaceLeafSourceFilePath(
  manifest: CommandManifest,
  leaf: CommandManifestCommandNode,
  builtSourceFilePath: string,
): CommandManifest {
  return {
    nodes: manifest.nodes.map((node) => {
      if (node.kind !== "command" || node.sourceFilePath !== leaf.sourceFilePath) {
        return node;
      }

      return { ...node, sourceFilePath: builtSourceFilePath };
    }),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Generates a fresh manifest and executes the matched command via Rolldown.
// `rune run` bundles the matched leaf (and `rune.config.ts` when help is
// rendered) on the fly so that its module resolution and transpilation match
// what `rune build` produces. This eliminates the structural asymmetry where a
// program that builds cleanly can still fail at `rune run` time (or vice
// versa).
export async function runRunCommand(options: RunRunCommandOptions): Promise<number> {
  let projectRoot = "";

  try {
    projectRoot = resolveProjectPath(options);
    const { sourceDirectory, commandsDirectory } = resolveProjectDirectories(projectRoot);
    const cliInfo = await readProjectCliInfo(projectRoot);

    if (cliInfo.version && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
      await writeStdout(`${cliInfo.name} v${cliInfo.version}\n`);
      return 0;
    }

    await assertCommandsDirectoryExists(commandsDirectory);

    const manifest = await generateCommandManifest({ commandsDirectory });
    await writeRunManifest(projectRoot, serializeCommandManifest(manifest));

    const configPath = await resolveConfigPath(projectRoot);
    const route = resolveCommandRoute(manifest, options.rawArgs);

    const runDirectory = await prepareRunDirectory(projectRoot);

    let runtimeManifest = manifest;
    let runtimeConfigPath = configPath;

    if (route.kind === "command") {
      // TODO: Mirror `rune build`'s runtime dependency warnings here so
      // dev-only imports are surfaced during local iteration as well.
      const builtSourceFilePath = await bundleCommandForRun(
        projectRoot,
        sourceDirectory,
        runDirectory,
        route.node,
      );
      await copyRunAssets(sourceDirectory, runDirectory);
      runtimeManifest = replaceLeafSourceFilePath(manifest, route.node, builtSourceFilePath);
    }

    const willRenderHelp =
      route.kind === "group" ||
      route.kind === "unknown" ||
      (route.kind === "command" && route.helpRequested);

    if (willRenderHelp && configPath !== undefined) {
      try {
        runtimeConfigPath = await bundleConfigForRun(projectRoot, runDirectory, configPath);
      } catch (error) {
        // Preserve the existing contract of `loadRuneConfigSafe`: a broken
        // `rune.config.ts` must not block help rendering. Warn and fall back to
        // the default renderer by passing `configPath: undefined` downstream.
        if (isBuildFailure(error)) {
          await writeStderrLine("Warning: Failed to load rune.config.ts.");
          runtimeConfigPath = undefined;
        } else {
          throw error;
        }
      }
    }

    return runManifestCommand({
      manifest: runtimeManifest,
      rawArgs: options.rawArgs,
      cliName: cliInfo.name,
      version: cliInfo.version,
      cwd: options.cwd,
      configPath: runtimeConfigPath,
    });
  } catch (error) {
    if (isBuildFailure(error)) {
      await writeStderrLine(formatBuildFailure(projectRoot, error));
      return 1;
    }

    await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune run");
    return 1;
  }
}
