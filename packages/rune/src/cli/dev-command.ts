import type { CommandExecutionResult } from "@rune-cli/core";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCommandManifest, serializeCommandManifest } from "../manifest/generate-manifest";
import { runManifestCommand } from "../manifest/run-manifest-command";
import {
  assertCommandsDirectoryExists,
  readProjectCliName,
  resolveCommandsDirectory,
  resolveProjectPath,
} from "../project/project-files";
import { failureResult } from "./result";

const DEV_MANIFEST_DIRECTORY_PATH = ".rune";
const DEV_MANIFEST_FILENAME = "manifest.json";

export interface RunDevCommandOptions {
  readonly rawArgs: readonly string[];
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

async function writeDevManifest(projectRoot: string, manifestContents: string): Promise<void> {
  const manifestDirectory = path.join(projectRoot, DEV_MANIFEST_DIRECTORY_PATH);
  const manifestPath = path.join(manifestDirectory, DEV_MANIFEST_FILENAME);

  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(manifestPath, manifestContents);
}

// Generates a fresh manifest and executes commands directly from source.
// `rune dev` imports command `.ts` modules without an extra loader, so it relies
// on a Node.js runtime that can execute native type-stripped TypeScript.
export async function runDevCommand(
  options: RunDevCommandOptions,
): Promise<CommandExecutionResult> {
  try {
    const projectRoot = resolveProjectPath(options);
    const commandsDirectory = resolveCommandsDirectory(projectRoot);

    await assertCommandsDirectoryExists(commandsDirectory);

    const manifest = await generateCommandManifest({ commandsDirectory });
    await writeDevManifest(projectRoot, serializeCommandManifest(manifest));

    return runManifestCommand({
      manifest,
      rawArgs: options.rawArgs,
      cliName: await readProjectCliName(projectRoot),
      cwd: options.cwd,
    });
  } catch (error) {
    return failureResult(error instanceof Error ? error.message : "Failed to run rune dev");
  }
}

export function renderRuneDevHelp(): string {
  return [
    "Usage: rune dev [--project <path>] [--] [command...]",
    "",
    "Run a Rune project in development mode.",
    "",
  ].join("\n");
}

export function renderRuneCliHelp(): string {
  return [
    "Usage: rune <command>",
    "",
    "Commands:",
    "  build  Build a Rune project into a distributable CLI",
    "  dev  Run a Rune project in development mode",
    "",
  ].join("\n");
}
