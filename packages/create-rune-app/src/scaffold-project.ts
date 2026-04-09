import { downloadTemplate } from "@bluwy/giget-core";
import fs from "node:fs/promises";
import path from "node:path";

const GITHUB_TEMPLATE = "github:morinokami/rune/examples/starter";

export interface ScaffoldedProject {
  readonly projectRoot: string;
  readonly packageName: string;
  readonly cliName: string;
}

function isScopedPackageName(projectName: string): boolean {
  return /^@[^/]+\/[^/]+$/.test(projectName);
}

function resolvePackageName(projectName: string, targetRoot: string): string {
  if (isScopedPackageName(projectName)) {
    return projectName;
  }

  return path.basename(targetRoot);
}

function resolveCliName(packageName: string): string {
  return packageName.startsWith("@") ? (packageName.split("/")[1] ?? packageName) : packageName;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

// Top-level entries produced by the starter template.
const TEMPLATE_ENTRIES = [".gitignore", "package.json", "tsconfig.json", "src", "tests"];

export async function findConflictingEntries(dirPath: string): Promise<readonly string[]> {
  const conflicts: string[] = [];

  for (const entry of TEMPLATE_ENTRIES) {
    if (await pathExists(path.join(dirPath, entry))) {
      conflicts.push(entry);
    }
  }

  return conflicts;
}

// Creates a minimal Rune project starter in a new directory.
export async function scaffoldProject(
  projectName: string,
  cwd: string = process.cwd(),
): Promise<ScaffoldedProject> {
  const currentDir = projectName === "." || projectName === "./";
  const projectRoot = path.resolve(cwd, projectName);

  if (currentDir) {
    const conflicts = await findConflictingEntries(projectRoot);

    if (conflicts.length > 0) {
      throw new Error(`Target directory contains conflicting files: ${conflicts.join(", ")}`);
    }
  } else if (await pathExists(projectRoot)) {
    throw new Error(`Target directory already exists: ${projectRoot}`);
  }

  const packageName = resolvePackageName(projectName, projectRoot);
  const cliName = resolveCliName(packageName);

  await downloadTemplate(GITHUB_TEMPLATE, {
    dir: ".",
    cwd: projectRoot,
    ...(currentDir && { force: true }),
  });

  // Post-process: update package.json with the actual project name and CLI binary name.
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as Record<
    string,
    unknown
  >;

  delete packageJson.private;
  packageJson.name = packageName;
  packageJson.bin = { [cliName]: "dist/cli.mjs" };

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  // Post-process: replace the placeholder CLI name with the actual one.
  for (const relativePath of [
    path.join("src", "commands", "hello.ts"),
    path.join("tests", "commands", "hello.test.ts"),
  ]) {
    const filePath = path.join(projectRoot, relativePath);
    const contents = await fs.readFile(filePath, "utf-8");
    await fs.writeFile(filePath, contents.replaceAll("my-cli", cliName));
  }

  return {
    projectRoot,
    packageName,
    cliName,
  };
}
