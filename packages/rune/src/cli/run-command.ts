import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../manifest/generate/generate-manifest";
import { runManifestCommand } from "../manifest/runtime/run-manifest-command";
import {
  assertCommandsDirectoryExists,
  readProjectCliInfo,
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { isVersionFlag } from "./flags";
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Generates a fresh manifest and executes commands directly from source.
// `rune run` imports command `.ts` modules without an extra loader, so it relies
// on a Node.js runtime that can execute native type-stripped TypeScript.
export async function runRunCommand(options: RunRunCommandOptions): Promise<number> {
  try {
    const projectRoot = resolveProjectPath(options);
    const { commandsDirectory } = resolveProjectDirectories(projectRoot);
    const cliInfo = await readProjectCliInfo(projectRoot);

    if (cliInfo.version && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
      await writeStdout(`${cliInfo.name} v${cliInfo.version}\n`);
      return 0;
    }

    await assertCommandsDirectoryExists(commandsDirectory);

    const manifest = await generateCommandManifest({ commandsDirectory });
    await writeRunManifest(projectRoot, serializeCommandManifest(manifest));

    const configPath = await resolveConfigPath(projectRoot);

    return runManifestCommand({
      manifest,
      rawArgs: options.rawArgs,
      cliName: cliInfo.name,
      version: cliInfo.version,
      cwd: options.cwd,
      configPath,
    });
  } catch (error) {
    await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune run");
    return 1;
  }
}
