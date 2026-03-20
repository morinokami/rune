import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { SCAFFOLDED_NODE_VERSION, SCAFFOLDED_RUNE_VERSION } from "./generated/scaffold-versions.ts";

const SCAFFOLDED_RUNE_PACKAGE_NAME = "@rune-cli/rune";
const SCAFFOLDED_TYPESCRIPT_VERSION = "^5.9.3";

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

function renderTemplatePackageJson(packageName: string, cliName: string): string {
  return `${JSON.stringify(
    {
      name: packageName,
      version: "0.0.0",
      type: "module",
      bin: {
        [cliName]: "dist/cli.mjs",
      },
      files: ["dist"],
      scripts: {
        dev: "rune dev",
        build: "rune build",
      },
      devDependencies: {
        [SCAFFOLDED_RUNE_PACKAGE_NAME]: SCAFFOLDED_RUNE_VERSION,
        typescript: SCAFFOLDED_TYPESCRIPT_VERSION,
      },
      engines: {
        node: SCAFFOLDED_NODE_VERSION,
      },
    },
    null,
    2,
  )}\n`;
}

function renderTemplateTsconfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        verbatimModuleSyntax: true,
        allowImportingTsExtensions: true,
      },
      include: ["src"],
    },
    null,
    2,
  )}\n`;
}

function renderTemplateHelloCommand(cliName: string): string {
  return [
    'import { defineCommand } from "@rune-cli/rune";',
    "",
    "export default defineCommand({",
    '  description: "Say hello from your new Rune CLI",',
    "  async run() {",
    `    console.log(${JSON.stringify(`hello from ${cliName}`)});`,
    "  },",
    "});",
    "",
  ].join("\n");
}

function renderTemplateGitignore(): string {
  return ["node_modules", "dist", ".rune", ""].join("\n");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

// Creates a minimal Rune project starter in a new directory.
export async function scaffoldProject(
  projectName: string,
  cwd: string = process.cwd(),
): Promise<ScaffoldedProject> {
  const projectRoot = path.resolve(cwd, projectName);

  if (await pathExists(projectRoot)) {
    throw new Error(`Target directory already exists: ${projectRoot}`);
  }

  const packageName = resolvePackageName(projectName, projectRoot);
  const cliName = resolveCliName(packageName);

  await Promise.all([
    writeProjectFile(projectRoot, "package.json", renderTemplatePackageJson(packageName, cliName)),
    writeProjectFile(projectRoot, "tsconfig.json", renderTemplateTsconfig()),
    writeProjectFile(projectRoot, ".gitignore", renderTemplateGitignore()),
    writeProjectFile(
      projectRoot,
      path.join("src", "commands", "hello", "index.ts"),
      renderTemplateHelloCommand(cliName),
    ),
  ]);

  return {
    projectRoot,
    packageName,
    cliName,
  };
}
