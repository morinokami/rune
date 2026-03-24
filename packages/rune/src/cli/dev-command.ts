import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateCommandManifest, serializeCommandManifest } from "../manifest/generate-manifest";
import { runManifestCommand } from "../manifest/run-manifest-command";
import {
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  resolveCommandsDirectory,
  resolveProjectPath,
} from "../project/project-files";
import { isVersionFlag } from "./flags";
import { writeStderrLine, writeStdout } from "./write-result";

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

export function renderRuneDevHelp(): string {
  return `\
Run a Rune project in development mode.

Usage: rune dev [options] [command...]

Options:
  --project <path>  Path to the Rune project root (default: current directory)
  -h, --help        Show this help message

Examples:
  rune dev hello
  rune dev --project ./my-app hello
`;
}

// Generates a fresh manifest and executes commands directly from source.
// `rune dev` imports command `.ts` modules without an extra loader, so it relies
// on a Node.js runtime that can execute native type-stripped TypeScript.
export async function runDevCommand(options: RunDevCommandOptions): Promise<number> {
  try {
    const projectRoot = resolveProjectPath(options);
    const cliInfo = await readProjectCliInfo(projectRoot);

    if (cliInfo.version && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
      await writeStdout(`${cliInfo.name} v${cliInfo.version}\n`);
      return 0;
    }

    const commandsDirectory = resolveCommandsDirectory(projectRoot);

    await assertCommandsDirectoryExists(commandsDirectory);

    const manifest = await generateCommandManifest({ commandsDirectory });
    await writeDevManifest(projectRoot, serializeCommandManifest(manifest));

    return runManifestCommand({
      manifest,
      rawArgs: options.rawArgs,
      cliName: cliInfo.name,
      version: cliInfo.version,
      cwd: options.cwd,
    });
  } catch (error) {
    await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune dev");
    return 1;
  }
}
