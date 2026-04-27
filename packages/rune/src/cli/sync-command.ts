import { readdir, stat } from "node:fs/promises";

import type { CommandManifest } from "../manifest/manifest-types";

import { generateCommandManifest } from "../manifest/generate/generate-manifest";
import {
  resolveConfigPath,
  resolveProjectDirectories,
  resolveProjectPath,
} from "../project/project-files";
import { validateGlobalOptions } from "./sync-global-options";
import { writeStderrLine, writeStdout } from "./write-result";

export interface RunSyncCommandOptions {
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

export async function runSyncCommand(options: RunSyncCommandOptions): Promise<number> {
  let projectRoot = "";

  try {
    projectRoot = resolveProjectPath(options);
    const directories = resolveProjectDirectories(projectRoot);
    const configPath = await resolveConfigPath(projectRoot);
    const manifest = await tryGenerateManifest(directories.commandsDirectory);

    await validateGlobalOptions({
      projectRoot,
      directories,
      configPath,
      manifest,
    });
    await writeStdout("Synced Rune project\n");
    return 0;
  } catch (error) {
    await writeStderrLine(error instanceof Error ? error.message : "Failed to run rune sync");
    return 1;
  }
}

// `rune sync` runs even before the user has authored their first command, so a
// missing commands directory is treated as "no manifest yet" rather than an
// error. The pre-flight stat lets us distinguish ENOENT from real I/O failures
// without inspecting `generateCommandManifest`'s error message.
async function tryGenerateManifest(
  commandsDirectory: string,
): Promise<CommandManifest | undefined> {
  const stats = await stat(commandsDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  });

  if (!stats?.isDirectory()) {
    return undefined;
  }

  const entries = await readdir(commandsDirectory);

  if (entries.length === 0) {
    return undefined;
  }

  return generateCommandManifest({ commandsDirectory });
}
