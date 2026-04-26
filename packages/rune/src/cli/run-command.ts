import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuneConfig } from "../core/define-config";
import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";
import type { ProjectCliInfo, ProjectDirectories } from "../project/project-files";
import type { ResolveCommandRouteResult } from "../routing/resolve-command-route";

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

export interface RunRunCommandOptions {
  readonly rawArgs: readonly string[];
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
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
    const context = await createRunCommandContext(projectRoot);

    if (isVersionRequest(options.rawArgs)) {
      const cliInfo = await resolveCliInfoForVersion(context);
      if (cliInfo.version) {
        await writeStdout(`${cliInfo.name} v${cliInfo.version}\n`);
        return 0;
      }
    }

    await assertCommandsDirectoryExists(context.directories.commandsDirectory);
    const manifest = await generateCommandManifest({
      commandsDirectory: context.directories.commandsDirectory,
    });
    await writeRunManifest(context.projectRoot, serializeCommandManifest(manifest));
    const route = resolveCommandRoute(manifest, options.rawArgs);
    const runtime = await resolveRuntime(context, manifest, route);

    return runManifestCommand({
      manifest: runtime.manifest,
      rawArgs: options.rawArgs,
      cliName: runtime.cliInfo.name,
      version: runtime.cliInfo.version,
      cwd: options.cwd,
      configPath: runtime.configPath,
      config: runtime.config,
    });
  } catch (error) {
    return reportRunCommandError(projectRoot, error);
  }
}

const RUN_MANIFEST_DIRECTORY_PATH = ".rune";
const RUN_MANIFEST_FILENAME = "manifest.json";

interface RunCommandContext {
  readonly projectRoot: string;
  readonly directories: ProjectDirectories;
  readonly packageCliInfo: ProjectCliInfo;
  readonly configPath?: string | undefined;
  readonly resources: LazyRunResources;
}

interface LazyRunResources {
  readonly getRunDirectory: () => Promise<string>;
  readonly getRunConfigResult: () => Promise<RunConfigLoadResult>;
}

interface RunConfigLoadResult {
  readonly configPath?: string | undefined;
  readonly config?: RuneConfig | undefined;
}

interface ResolvedRuntime extends RunConfigLoadResult {
  readonly manifest: CommandManifest;
  readonly cliInfo: ProjectCliInfo;
}

async function createRunCommandContext(projectRoot: string): Promise<RunCommandContext> {
  const directories = resolveProjectDirectories(projectRoot);
  const packageCliInfo = await readProjectCliInfo(projectRoot);
  const configPath = await resolveConfigPath(projectRoot);

  return {
    projectRoot,
    directories,
    packageCliInfo,
    configPath,
    resources: createLazyRunResources(projectRoot, configPath),
  };
}

function createLazyRunResources(
  projectRoot: string,
  configPath: string | undefined,
): LazyRunResources {
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

  return {
    getRunDirectory,
    getRunConfigResult,
  };
}

function isVersionRequest(rawArgs: readonly string[]): boolean {
  return rawArgs.length === 1 && isVersionFlag(rawArgs[0]);
}

async function resolveCliInfoForVersion(
  context: Pick<RunCommandContext, "configPath" | "packageCliInfo" | "resources">,
): Promise<ProjectCliInfo> {
  if (context.configPath === undefined) {
    return context.packageCliInfo;
  }

  const loadedConfig = await context.resources.getRunConfigResult();
  return applyProjectCliInfoOverrides(context.packageCliInfo, loadedConfig.config);
}

async function resolveRuntime(
  context: Pick<
    RunCommandContext,
    "configPath" | "directories" | "packageCliInfo" | "projectRoot" | "resources"
  >,
  manifest: CommandManifest,
  route: ResolveCommandRouteResult,
): Promise<ResolvedRuntime> {
  const commandRuntimeManifest = await applyCommandBundlingToManifest(context, manifest, route);
  const helpConfig = shouldRenderHelp(route) ? await loadHelpConfig(context) : null;

  return {
    manifest: commandRuntimeManifest,
    cliInfo: helpConfig
      ? applyProjectCliInfoOverrides(context.packageCliInfo, helpConfig.config)
      : context.packageCliInfo,
    configPath: helpConfig === null ? context.configPath : helpConfig.configPath,
    config: helpConfig?.config,
  };
}

async function applyCommandBundlingToManifest(
  context: Pick<RunCommandContext, "directories" | "projectRoot" | "resources">,
  manifest: CommandManifest,
  route: ResolveCommandRouteResult,
): Promise<CommandManifest> {
  if (route.kind !== "command") {
    return manifest;
  }

  // TODO: Mirror `rune build`'s runtime dependency warnings here so
  // dev-only imports are surfaced during local iteration as well.
  const runDirectory = await context.resources.getRunDirectory();
  const builtSourceFilePath = await bundleCommandForRun(
    context.projectRoot,
    context.directories.sourceDirectory,
    runDirectory,
    route.node,
  );
  await copyRunAssets(context.directories.sourceDirectory, runDirectory);

  return replaceLeafSourceFilePath(manifest, route.node, builtSourceFilePath);
}

async function loadHelpConfig(
  context: Pick<RunCommandContext, "configPath" | "resources">,
): Promise<RunConfigLoadResult | null> {
  if (context.configPath === undefined) {
    return null;
  }

  return context.resources.getRunConfigResult();
}

function shouldRenderHelp(route: ResolveCommandRouteResult): boolean {
  return (
    route.kind === "group" ||
    route.kind === "unknown" ||
    (route.kind === "command" && route.helpRequested)
  );
}

async function reportRunCommandError(projectRoot: string, error: unknown): Promise<number> {
  if (isBuildFailure(error)) {
    await writeStderrLine(formatBuildFailure(projectRoot, error));
    return 1;
  }

  await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune run");
  return 1;
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
