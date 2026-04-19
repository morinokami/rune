import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "rolldown";

import type { CommandManifest } from "../manifest/manifest-types";

import { toPosixPath } from "./path-utils";
import {
  createExternalDependenciesContext,
  createSharedBuildConfig,
  pathExists,
  resolveBuildTsconfig,
  stripFileExtension,
} from "./rolldown-shared";

export { formatBuildFailure, isBuildFailure } from "./rolldown-shared";

export const BUILD_CLI_FILENAME = "cli.mjs";
export const BUILD_MANIFEST_FILENAME = "manifest.json";

const BUILD_CONFIG_FILENAME = "config.mjs";
const RUNE_PACKAGE_NAME = "@rune-cli/rune";
const BUILT_CLI_ENTRY_ID = "virtual:rune-built-cli-entry";

interface RunePackageJson {
  readonly name?: string | undefined;
}

function renderBuiltCliEntry(
  cliName: string,
  version: string | undefined,
  runtimeImportPath: string,
  hasConfig: boolean,
): string {
  const configLine = hasConfig
    ? `const configPath = fileURLToPath(new URL("./${BUILD_CONFIG_FILENAME}", distDirectoryUrl));\n`
    : "";
  const configOption = hasConfig ? "\n  configPath," : "";

  return `import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runManifestCommand } from ${JSON.stringify(runtimeImportPath)};

const cliName = ${JSON.stringify(cliName)};
const version = ${JSON.stringify(version)};
const distDirectoryUrl = new URL("./", import.meta.url);
const manifestPath = fileURLToPath(new URL("./${BUILD_MANIFEST_FILENAME}", distDirectoryUrl));
const manifestContents = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestContents);
const runtimeManifest = {
  ...manifest,
  nodes: manifest.nodes.map((node) =>
    node.kind === "command"
      ? {
          ...node,
          sourceFilePath: fileURLToPath(new URL(node.sourceFilePath, distDirectoryUrl)),
        }
      : node,
  ),
};
${configLine}process.exitCode = await runManifestCommand({
  manifest: runtimeManifest,
  rawArgs: process.argv.slice(2),
  cliName,
  version,
  cwd: process.cwd(),${configOption}
});
`;
}

function createBuiltCliEntryPlugin(source: string): Plugin {
  const resolvedId = `\0${BUILT_CLI_ENTRY_ID}`;

  return {
    name: "rune-built-cli-entry",
    resolveId(id) {
      if (id === BUILT_CLI_ENTRY_ID) {
        return resolvedId;
      }

      return null;
    },
    load(id) {
      if (id === resolvedId) {
        return source;
      }

      return null;
    },
  };
}

function createCommandInputMap(
  manifest: CommandManifest,
  sourceDirectory: string,
): Record<string, string> {
  return Object.fromEntries(
    manifest.nodes.flatMap((node) => {
      if (node.kind !== "command") {
        return [];
      }

      const relativeSourceFilePath = path.relative(sourceDirectory, node.sourceFilePath);
      const entryName = toPosixPath(stripFileExtension(relativeSourceFilePath));

      return [[entryName, node.sourceFilePath] as const];
    }),
  );
}

async function resolveRunePackageRoot(): Promise<string> {
  let currentDirectory = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const packageJsonPath = path.join(currentDirectory, "package.json");

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as RunePackageJson;

      if (packageJson.name === RUNE_PACKAGE_NAME) {
        return currentDirectory;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      throw new Error(`Could not locate package root for ${RUNE_PACKAGE_NAME}`);
    }

    currentDirectory = parentDirectory;
  }
}

async function resolveRuntimeHelperEntryPath(): Promise<string> {
  const packageRoot = await resolveRunePackageRoot();
  const sourceRuntimePath = path.join(packageRoot, "src", "runtime.ts");

  if (await pathExists(sourceRuntimePath)) {
    return sourceRuntimePath;
  }

  const distRuntimePath = path.join(packageRoot, "dist", "runtime.mjs");

  if (await pathExists(distRuntimePath)) {
    return distRuntimePath;
  }

  throw new Error("Could not locate Rune runtime helper entry");
}

export async function buildCommandEntries(
  projectRoot: string,
  sourceDirectory: string,
  distDirectory: string,
  manifest: CommandManifest,
  externalDependenciesContext = createExternalDependenciesContext(),
): Promise<void> {
  const input = createCommandInputMap(manifest, sourceDirectory);

  if (Object.keys(input).length === 0) {
    return;
  }

  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input,
    plugins: [externalDependenciesContext.plugin],
    output: {
      // Rune assembles dist across multiple builds, so each step must preserve prior output.
      dir: distDirectory,
      format: "es",
      entryFileNames: "[name].mjs",
      chunkFileNames: "chunks/[name]-[hash].mjs",
      cleanDir: false,
    },
  });
}

export async function buildConfigEntry(
  projectRoot: string,
  distDirectory: string,
  configPath: string,
  externalDependenciesContext = createExternalDependenciesContext(),
): Promise<void> {
  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input: configPath,
    plugins: [externalDependenciesContext.plugin],
    output: {
      // Rune assembles dist across multiple builds, so each step must preserve prior output.
      file: path.join(distDirectory, BUILD_CONFIG_FILENAME),
      format: "es",
      cleanDir: false,
    },
  });
}

export async function buildCliEntry(
  distDirectory: string,
  cliName: string,
  version: string | undefined,
  hasConfig: boolean,
): Promise<void> {
  const runtimeHelperEntryPath = await resolveRuntimeHelperEntryPath();
  const runtimeHelperDirectory = path.dirname(runtimeHelperEntryPath);
  const externalDependenciesContext = createExternalDependenciesContext();

  await build({
    ...createSharedBuildConfig(runtimeHelperDirectory, false),
    input: BUILT_CLI_ENTRY_ID,
    plugins: [
      // The built CLI entry currently imports only the in-repo runtime helper.
      // Keep it on the same shared externalization plugin for consistency, but
      // do not surface its package set in warnings unless this template grows
      // third-party runtime imports in the future.
      externalDependenciesContext.plugin,
      createBuiltCliEntryPlugin(
        renderBuiltCliEntry(
          cliName,
          version,
          `./${path.basename(runtimeHelperEntryPath)}`,
          hasConfig,
        ),
      ),
    ],
    output: {
      // Rune assembles dist across multiple builds, so each step must preserve prior output.
      file: path.join(distDirectory, BUILD_CLI_FILENAME),
      format: "es",
      banner: "#!/usr/bin/env node",
      cleanDir: false,
    },
  });
}
