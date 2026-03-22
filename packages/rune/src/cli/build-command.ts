import type { CommandExecutionResult } from "@rune-cli/core";

import { build, type BuildFailure } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CommandManifest, CommandManifestCommandNode } from "../manifest/manifest-types";

import { generateCommandManifest, serializeCommandManifest } from "../manifest/generate-manifest";
import {
  assertCommandsDirectoryExists,
  readProjectCliName,
  resolveCommandsDirectory,
  resolveDistDirectory,
  resolveProjectPath,
  resolveSourceDirectory,
} from "../project/project-files";
import { failureResult, successResult } from "./result";

const BUILD_CLI_FILENAME = "cli.mjs";
const BUILD_MANIFEST_FILENAME = "manifest.json";
const RUNE_PACKAGE_NAME = "@rune-cli/rune";

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
const BUILD_TARGET = "node24";

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

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
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

function isBuildFailure(error: unknown): error is BuildFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}

function formatBuildFailure(projectRoot: string, error: BuildFailure): string {
  const [firstError] = error.errors;

  if (!firstError) {
    return "Failed to build project";
  }

  if (!firstError.location) {
    return `Failed to compile: ${firstError.text}`;
  }

  const filePath = path.isAbsolute(firstError.location.file)
    ? path.relative(projectRoot, firstError.location.file)
    : firstError.location.file;

  return `Failed to compile ${filePath}:${firstError.location.line}:${firstError.location.column + 1}: ${firstError.text}`;
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

function renderBuiltCliEntry(cliName: string, runtimeImportPath: string): string {
  return `import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { runManifestCommand, writeCommandExecutionResult } from ${JSON.stringify(runtimeImportPath)};

const cliName = ${JSON.stringify(cliName)};
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
const result = await runManifestCommand({
  manifest: runtimeManifest,
  rawArgs: process.argv.slice(2),
  cliName,
  cwd: process.cwd(),
});

await writeCommandExecutionResult(result);
`;
}

function collectCommandEntryPoints(manifest: CommandManifest): readonly string[] {
  return manifest.nodes.flatMap((node) => (node.kind === "command" ? [node.sourceFilePath] : []));
}

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

async function resolveBuildTsconfig(projectRoot: string): Promise<string | undefined> {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");

  return (await pathExists(tsconfigPath)) ? tsconfigPath : undefined;
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

async function buildCommandEntries(
  projectRoot: string,
  sourceDirectory: string,
  distDirectory: string,
  manifest: CommandManifest,
): Promise<void> {
  const entryPoints = [...collectCommandEntryPoints(manifest)];
  const tsconfig = await resolveBuildTsconfig(projectRoot);

  if (entryPoints.length === 0) {
    return;
  }

  await build({
    absWorkingDir: projectRoot,
    entryPoints,
    outdir: distDirectory,
    outbase: sourceDirectory,
    entryNames: "[dir]/[name]",
    chunkNames: "chunks/[name]-[hash]",
    assetNames: "assets/[name]-[hash]",
    bundle: true,
    format: "esm",
    platform: "node",
    target: BUILD_TARGET,
    splitting: true,
    tsconfig,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
    write: true,
  });
}

async function buildCliEntry(
  projectRoot: string,
  distDirectory: string,
  cliName: string,
): Promise<void> {
  const runtimeHelperEntryPath = await resolveRuntimeHelperEntryPath();

  await build({
    absWorkingDir: projectRoot,
    stdin: {
      contents: renderBuiltCliEntry(cliName, `./${path.basename(runtimeHelperEntryPath)}`),
      loader: "ts",
      resolveDir: path.dirname(runtimeHelperEntryPath),
      sourcefile: "rune-built-cli-entry.ts",
    },
    outfile: path.join(distDirectory, BUILD_CLI_FILENAME),
    bundle: true,
    format: "esm",
    platform: "node",
    target: BUILD_TARGET,
    // This bundle is composed from Rune's own runtime helper source, so it must
    // not inherit the target project's tsconfig path mapping or module settings.
    banner: {
      js: "#!/usr/bin/env node",
    },
    logLevel: "silent",
    write: true,
  });
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

export function renderRuneBuildHelp(): string {
  return `\
Build a Rune project into a distributable CLI.

Usage: rune build [options]

Options:
  --project <path>  Path to the Rune project root (default: current directory)
  -h, --help        Show this help message

Examples:
  rune build
  rune build --project ./my-app
`;
}

export async function runBuildCommand(
  options: RunBuildCommandOptions,
): Promise<CommandExecutionResult> {
  let projectRoot = "";

  try {
    projectRoot = resolveProjectPath(options);
    const sourceDirectory = resolveSourceDirectory(projectRoot);
    const commandsDirectory = resolveCommandsDirectory(projectRoot);
    const distDirectory = resolveDistDirectory(projectRoot);

    await assertCommandsDirectoryExists(commandsDirectory);
    const sourceManifest = await generateCommandManifest({ commandsDirectory });
    const builtManifest = createBuiltManifest(sourceManifest, sourceDirectory);
    const cliName = await readProjectCliName(projectRoot);

    await rm(distDirectory, { recursive: true, force: true });
    await writeBuiltRuntimeFiles(distDirectory, builtManifest);
    await Promise.all([
      buildCommandEntries(projectRoot, sourceDirectory, distDirectory, sourceManifest),
      buildCliEntry(projectRoot, distDirectory, cliName),
      copyBuiltAssets(sourceDirectory, distDirectory),
    ]);

    return successResult(`Built CLI to ${path.join(distDirectory, BUILD_CLI_FILENAME)}\n`);
  } catch (error) {
    if (isBuildFailure(error)) {
      return failureResult(formatBuildFailure(projectRoot, error));
    }

    return failureResult(error instanceof Error ? error.message : "Failed to run rune build");
  }
}
