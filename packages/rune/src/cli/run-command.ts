import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuneConfig } from "../core/define-config";
import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import {
  applyProjectCliInfoOverrides,
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { isVersionFlag } from "../routing/framework-flags";
import { resolveCommandRoute } from "../routing/resolve-command-route";
import { loadRuneConfigSafe } from "../runtime/load-rune-config";
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

interface RunConfigLoadResult {
  readonly configPath?: string | undefined;
  readonly config?: RuneConfig | undefined;
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

async function loadBundledRunConfigSafe(
  projectRoot: string,
  runDirectory: string,
  configPath: string | undefined,
): Promise<RunConfigLoadResult> {
  if (configPath === undefined) {
    return { configPath: undefined, config: undefined };
  }

  try {
    const bundledConfigPath = await bundleConfigForRun(projectRoot, runDirectory, configPath);
    return {
      configPath: bundledConfigPath,
      config: await loadRuneConfigSafe(bundledConfigPath),
    };
  } catch (error) {
    // Preserve the existing contract: a broken `rune.config.ts` must not block
    // help rendering or metadata fallback.
    if (isBuildFailure(error)) {
      await writeStderrLine("Warning: Failed to load rune.config.ts.");
      return { configPath: undefined, config: undefined };
    }

    throw error;
  }
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
    const packageCliInfo = await readProjectCliInfo(projectRoot);
    const configPath = await resolveConfigPath(projectRoot);
    let runDirectory: string | undefined;
    let runConfigResult: RunConfigLoadResult | undefined;

    async function getRunDirectory(): Promise<string> {
      runDirectory ??= await prepareRunDirectory(projectRoot);
      return runDirectory;
    }

    async function getRunConfigResult(): Promise<RunConfigLoadResult> {
      runConfigResult ??= await loadBundledRunConfigSafe(
        projectRoot,
        await getRunDirectory(),
        configPath,
      );
      return runConfigResult;
    }

    if (options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
      let cliInfo = packageCliInfo;

      if (configPath !== undefined) {
        const loadedConfig = await getRunConfigResult();
        cliInfo = applyProjectCliInfoOverrides(packageCliInfo, loadedConfig.config);
      }

      if (cliInfo.version) {
        await writeStdout(`${cliInfo.name} v${cliInfo.version}\n`);
        return 0;
      }
    }

    await assertCommandsDirectoryExists(commandsDirectory);

    const manifest = await generateCommandManifest({ commandsDirectory });
    await writeRunManifest(projectRoot, serializeCommandManifest(manifest));

    const route = resolveCommandRoute(manifest, options.rawArgs);

    const preparedRunDirectory = await getRunDirectory();

    let runtimeManifest = manifest;
    let runtimeConfigPath = configPath;
    let runtimeConfig: RuneConfig | undefined;
    let cliInfo = packageCliInfo;

    if (route.kind === "command") {
      // TODO: Mirror `rune build`'s runtime dependency warnings here so
      // dev-only imports are surfaced during local iteration as well.
      const builtSourceFilePath = await bundleCommandForRun(
        projectRoot,
        sourceDirectory,
        preparedRunDirectory,
        route.node,
      );
      await copyRunAssets(sourceDirectory, preparedRunDirectory);
      runtimeManifest = replaceLeafSourceFilePath(manifest, route.node, builtSourceFilePath);
    }

    const willRenderHelp =
      route.kind === "group" ||
      route.kind === "unknown" ||
      (route.kind === "command" && route.helpRequested);

    if (willRenderHelp && configPath !== undefined) {
      const configResult = await getRunConfigResult();
      runtimeConfigPath = configResult.configPath;
      runtimeConfig = configResult.config;
      cliInfo = applyProjectCliInfoOverrides(packageCliInfo, runtimeConfig);
    }

    return runManifestCommand({
      manifest: runtimeManifest,
      rawArgs: options.rawArgs,
      cliName: cliInfo.name,
      version: cliInfo.version,
      cwd: options.cwd,
      configPath: runtimeConfigPath,
      config: runtimeConfig,
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
