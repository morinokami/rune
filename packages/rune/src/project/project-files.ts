import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const SOURCE_DIRECTORY_NAME = "src";
const COMMANDS_DIRECTORY_NAME = path.join(SOURCE_DIRECTORY_NAME, "commands");
const DIST_DIRECTORY_NAME = "dist";
const CONFIG_FILENAME = "rune.config.ts";

export interface ProjectPackageJson {
  readonly bin?: string | Readonly<Record<string, string>> | undefined;
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly devDependencies?: Readonly<Record<string, string>> | undefined;
  readonly name?: string | undefined;
  readonly optionalDependencies?: Readonly<Record<string, string>> | undefined;
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
  readonly version?: string | undefined;
}

export interface ProjectCliInfo {
  readonly name: string;
  readonly version?: string | undefined;
}

export interface ResolveProjectPathOptions {
  readonly cwd?: string | undefined;
  readonly projectPath?: string | undefined;
}

export interface ProjectDirectories {
  readonly sourceDirectory: string;
  readonly commandsDirectory: string;
  readonly distDirectory: string;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export function resolveProjectPath(options: ResolveProjectPathOptions): string {
  const baseDirectory = options.cwd ?? process.cwd();
  return path.resolve(baseDirectory, options.projectPath ?? ".");
}

export function resolveProjectDirectories(projectRoot: string): ProjectDirectories {
  return {
    sourceDirectory: path.join(projectRoot, SOURCE_DIRECTORY_NAME),
    commandsDirectory: path.join(projectRoot, COMMANDS_DIRECTORY_NAME),
    distDirectory: path.join(projectRoot, DIST_DIRECTORY_NAME),
  };
}

// ---------------------------------------------------------------------------
// Project metadata helpers
// ---------------------------------------------------------------------------

function resolveCliNameFromPackageJson(packageJson: ProjectPackageJson): string | undefined {
  if (packageJson.bin && typeof packageJson.bin === "object") {
    const binNames = Object.keys(packageJson.bin).sort((left, right) => left.localeCompare(right));

    if (binNames.length > 0) {
      return binNames[0];
    }
  }

  if (packageJson.name && packageJson.name.length > 0) {
    const packageNameSegments = packageJson.name.split("/");
    return packageNameSegments.at(-1) ?? packageJson.name;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readProjectCliInfo(projectRoot: string): Promise<ProjectCliInfo> {
  const packageJson = await readProjectPackageJson(projectRoot);
  const name = packageJson ? resolveCliNameFromPackageJson(packageJson) : undefined;

  return {
    name: name ?? path.basename(projectRoot),
    version: packageJson?.version,
  };
}

export async function readProjectPackageJson(
  projectRoot: string,
): Promise<ProjectPackageJson | undefined> {
  const packageJsonPath = path.join(projectRoot, "package.json");

  try {
    const packageJsonContents = await readFile(packageJsonPath, "utf8");
    return JSON.parse(packageJsonContents) as ProjectPackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return undefined;
}

export async function resolveConfigPath(projectRoot: string): Promise<string | undefined> {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);

  try {
    const stats = await stat(configPath);
    return stats.isFile() ? configPath : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
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
    throw new Error(
      `Commands directory not found at ${COMMANDS_DIRECTORY_NAME}. Create it or check the --project <path> option.`,
    );
  }
}
