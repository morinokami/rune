import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRECTORY_NAME = "src";
const COMMANDS_DIRECTORY_NAME = path.join(SOURCE_DIRECTORY_NAME, "commands");
const DIST_DIRECTORY_NAME = "dist";

interface ProjectPackageJson {
  readonly bin?: string | Readonly<Record<string, string>> | undefined;
  readonly name?: string | undefined;
}

export interface ResolveProjectPathOptions {
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

export function resolveProjectPath(options: ResolveProjectPathOptions): string {
  const baseDirectory = options.cwd ?? process.cwd();
  return path.resolve(baseDirectory, options.projectPath ?? ".");
}

export function resolveSourceDirectory(projectRoot: string): string {
  return path.join(projectRoot, SOURCE_DIRECTORY_NAME);
}

export function resolveCommandsDirectory(projectRoot: string): string {
  return path.join(projectRoot, COMMANDS_DIRECTORY_NAME);
}

export function resolveDistDirectory(projectRoot: string): string {
  return path.join(projectRoot, DIST_DIRECTORY_NAME);
}

export async function readProjectCliName(projectRoot: string): Promise<string> {
  const packageJsonPath = path.join(projectRoot, "package.json");

  try {
    const packageJsonContents = await readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContents) as ProjectPackageJson;

    if (packageJson.bin && typeof packageJson.bin === "object") {
      const binNames = Object.keys(packageJson.bin).sort((left, right) =>
        left.localeCompare(right),
      );

      if (binNames.length > 0) {
        return binNames[0];
      }
    }

    if (packageJson.name && packageJson.name.length > 0) {
      const packageNameSegments = packageJson.name.split("/");
      return packageNameSegments.at(-1) ?? packageJson.name;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return path.basename(projectRoot);
}

export async function assertCommandsDirectoryExists(commandsDirectory: string): Promise<void> {
  const commandsDirectoryStats = await stat(commandsDirectory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }

      throw error;
    },
  );

  if (!commandsDirectoryStats?.isDirectory()) {
    throw new Error(`Commands directory not found: ${commandsDirectory}`);
  }
}
