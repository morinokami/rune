import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "rolldown";

import type { CommandManifestCommandNode } from "../manifest/manifest-types";

import { copyBuiltAssets } from "./copy-assets";
import { toPosixPath } from "./path-utils";
import {
  createExternalDependenciesContext,
  createSharedBuildConfig,
  resolveBuildTsconfig,
  stripFileExtension,
} from "./rolldown-shared";

export const RUN_DIRECTORY_NAME = path.join(".rune", "run");
export const RUN_CONFIG_FILENAME = "config.mjs";

// Resets the `.rune/run/` directory so that stale artifacts from removed
// commands or previous runs cannot leak into the next invocation.
export async function prepareRunDirectory(projectRoot: string): Promise<string> {
  const runDirectory = path.join(projectRoot, RUN_DIRECTORY_NAME);
  await rm(runDirectory, { recursive: true, force: true });
  await mkdir(runDirectory, { recursive: true });
  return runDirectory;
}

// Bundles a single matched leaf and returns the absolute path to the emitted
// `.mjs`. Source layout is preserved so that `import.meta.url`-relative asset
// references resolve consistently with `rune build`.
export async function bundleCommandForRun(
  projectRoot: string,
  sourceDirectory: string,
  runDirectory: string,
  leaf: CommandManifestCommandNode,
): Promise<string> {
  const relativeSourceFilePath = path.relative(sourceDirectory, leaf.sourceFilePath);
  const entryName = toPosixPath(stripFileExtension(relativeSourceFilePath));
  const externalDependenciesContext = createExternalDependenciesContext();

  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input: { [entryName]: leaf.sourceFilePath },
    plugins: [externalDependenciesContext.plugin],
    output: {
      dir: runDirectory,
      format: "es",
      entryFileNames: "[name].mjs",
      chunkFileNames: "chunks/[name]-[hash].mjs",
      cleanDir: false,
    },
  });

  return path.join(runDirectory, `${entryName}.mjs`);
}

// Bundles `rune.config.ts` into `.rune/run/config.mjs` and returns its path.
// Only invoked on paths that actually load config (help rendering) so that a
// broken config does not block unrelated command executions.
export async function bundleConfigForRun(
  projectRoot: string,
  runDirectory: string,
  configPath: string,
): Promise<string> {
  const outputPath = path.join(runDirectory, RUN_CONFIG_FILENAME);
  const externalDependenciesContext = createExternalDependenciesContext();

  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input: configPath,
    plugins: [externalDependenciesContext.plugin],
    output: {
      file: outputPath,
      format: "es",
      cleanDir: false,
    },
  });

  return outputPath;
}

// Mirrors `rune build`'s asset copy so that non-code assets live next to the
// bundled `.mjs` at the same relative layout as the source tree.
export async function copyRunAssets(sourceDirectory: string, runDirectory: string): Promise<void> {
  await copyBuiltAssets(sourceDirectory, runDirectory);
}
