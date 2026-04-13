import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, type BundleError, type InputOptions, type Plugin } from "rolldown";

import type { CommandManifest } from "../manifest/manifest-types";

import { toPosixPath } from "./path-utils";

export const BUILD_CLI_FILENAME = "cli.mjs";
export const BUILD_MANIFEST_FILENAME = "manifest.json";

const BUILD_TARGET = "node24";
const BUILD_CONFIG_FILENAME = "config.mjs";
const RUNE_PACKAGE_NAME = "@rune-cli/rune";
const BUILT_CLI_ENTRY_ID = "virtual:rune-built-cli-entry";

interface RunePackageJson {
  readonly name?: string | undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function stripFileExtension(filePath: string): string {
  const parsedPath = path.parse(filePath);
  return path.join(parsedPath.dir, parsedPath.name);
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

async function resolveBuildTsconfig(projectRoot: string): Promise<false | string> {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");

  return (await pathExists(tsconfigPath)) ? tsconfigPath : false;
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

function createSharedBuildConfig(
  cwd: string,
  tsconfig: false | string,
): Pick<InputOptions, "cwd" | "platform" | "tsconfig" | "transform" | "logLevel"> {
  return {
    cwd,
    platform: "node",
    tsconfig,
    transform: {
      target: BUILD_TARGET,
    },
    logLevel: "silent",
  };
}

export function isBuildFailure(error: unknown): error is BundleError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}

export function formatBuildFailure(projectRoot: string, error: BundleError): string {
  const [firstError] = error.errors ?? [];

  if (!firstError) {
    return "Failed to build project";
  }

  if (!firstError.loc?.file) {
    return `Failed to compile: ${firstError.message}`;
  }

  const filePath = path.isAbsolute(firstError.loc.file)
    ? path.relative(projectRoot, firstError.loc.file)
    : firstError.loc.file;

  return `Failed to compile ${filePath}:${firstError.loc.line}:${firstError.loc.column + 1}: ${firstError.message}`;
}

export async function buildCommandEntries(
  projectRoot: string,
  sourceDirectory: string,
  distDirectory: string,
  manifest: CommandManifest,
): Promise<void> {
  const input = createCommandInputMap(manifest, sourceDirectory);

  if (Object.keys(input).length === 0) {
    return;
  }

  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input,
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
): Promise<void> {
  await build({
    ...createSharedBuildConfig(projectRoot, await resolveBuildTsconfig(projectRoot)),
    input: configPath,
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

  await build({
    ...createSharedBuildConfig(runtimeHelperDirectory, false),
    input: BUILT_CLI_ENTRY_ID,
    plugins: [
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
