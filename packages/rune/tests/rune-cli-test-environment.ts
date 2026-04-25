import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, open, realpath, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vite-plus/test";

import { createTempFixtureManager, pathExists } from "./helpers";

const packagedWorkspaces = createTempFixtureManager();
const sourceRunePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const vpBinaryPath = fileURLToPath(new URL("../node_modules/.bin/vp", import.meta.url));
const PACKAGED_ENTRIES = ["package.json", "src", "tsconfig.json", "vite.config.ts"];

let builtPackageEnvironmentPromise: Promise<{ readonly runePackageRoot: string }> | undefined;

export interface CapturedProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CaptureProcessResultOptions {
  readonly timeoutMs?: number | undefined;
}

interface TestPackageJson {
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly devDependencies?: Readonly<Record<string, string>> | undefined;
}

export function setupRuneCliTestEnvironment(): void {
  afterAll(async () => {
    await packagedWorkspaces.cleanup();
  });
}

function createCleanEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_OPTIONS: "",
    VITEST: "",
    VITEST_POOL_ID: "",
    VITEST_WORKER_ID: "",
  };
}

async function runVpPack(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(vpBinaryPath, ["pack"], {
      cwd,
      env: createCleanEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    childProcess.stderr.setEncoding("utf8");
    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr || `vp pack failed with exit code ${exitCode}`));
      } else {
        resolve();
      }
    });
  });
}

async function copyPackageForPack(
  sourcePackageRoot: string,
  targetWorkspaceRoot: string,
): Promise<string> {
  const targetPackageRoot = path.join(targetWorkspaceRoot, path.basename(sourcePackageRoot));

  await mkdir(targetPackageRoot, { recursive: true });

  for (const entryName of PACKAGED_ENTRIES) {
    const sourceEntryPath = path.join(sourcePackageRoot, entryName);

    if (!(await pathExists(sourceEntryPath))) {
      continue;
    }

    await cp(sourceEntryPath, path.join(targetPackageRoot, entryName), { recursive: true });
  }

  return targetPackageRoot;
}

async function symlinkPath(sourcePath: string, targetPath: string): Promise<void> {
  const resolvedSourcePath = await realpath(sourcePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await symlink(resolvedSourcePath, targetPath, "dir");
}

async function linkPackageDependencies(
  sourcePackageRoot: string,
  targetPackageRoot: string,
): Promise<void> {
  const sourceNodeModulesDirectory = path.join(sourcePackageRoot, "node_modules");
  const targetNodeModulesDirectory = path.join(targetPackageRoot, "node_modules");
  const packageJson = JSON.parse(
    await readFile(path.join(sourcePackageRoot, "package.json"), "utf8"),
  ) as TestPackageJson;
  const dependencies = new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);

  await mkdir(targetNodeModulesDirectory, { recursive: true });

  if (await pathExists(path.join(sourceNodeModulesDirectory, ".bin"))) {
    await symlinkPath(
      path.join(sourceNodeModulesDirectory, ".bin"),
      path.join(targetNodeModulesDirectory, ".bin"),
    );
  }

  for (const dependencyName of dependencies) {
    const targetDependencyPath = path.join(targetNodeModulesDirectory, dependencyName);
    await symlinkPath(path.join(sourceNodeModulesDirectory, dependencyName), targetDependencyPath);
  }
}

export async function ensureBuiltPackageEnvironment(): Promise<{
  readonly runePackageRoot: string;
}> {
  builtPackageEnvironmentPromise ??= (async () => {
    const packagedWorkspaceRoot = await packagedWorkspaces.createRoot();

    const runePackageRoot = await copyPackageForPack(sourceRunePackageRoot, packagedWorkspaceRoot);
    await linkPackageDependencies(sourceRunePackageRoot, runePackageRoot);

    await runVpPack(runePackageRoot);

    return { runePackageRoot };
  })().catch((error) => {
    builtPackageEnvironmentPromise = undefined;
    throw error;
  });

  return await builtPackageEnvironmentPromise;
}

export async function installRuneFixturePackage(projectRoot: string): Promise<void> {
  const { runePackageRoot } = await ensureBuiltPackageEnvironment();

  const nodeModulesDirectory = path.join(projectRoot, "node_modules");
  const runeScopeDirectory = path.join(nodeModulesDirectory, "@rune-cli");
  const runePackageDirectory = path.join(runeScopeDirectory, "rune");

  await mkdir(runeScopeDirectory, { recursive: true });
  await symlink(runePackageRoot, runePackageDirectory, "dir");
}

export async function captureProcessResult(
  cwd: string,
  command: string,
  args: readonly string[],
  options: CaptureProcessResultOptions = {},
): Promise<CapturedProcessResult> {
  const outputId = randomUUID();
  const stdoutPath = path.join(cwd, `.process-${outputId}.stdout`);
  const stderrPath = path.join(cwd, `.process-${outputId}.stderr`);
  const stdoutFile = await open(stdoutPath, "w+");
  const stderrFile = await open(stderrPath, "w+");
  const timeoutMs = options.timeoutMs ?? 30_000;

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const childProcess = spawn(command, args, {
        cwd,
        env: createCleanEnv(),
        stdio: ["ignore", stdoutFile.fd, stderrFile.fd],
        timeout: timeoutMs,
      });

      childProcess.on("error", reject);
      childProcess.on("close", (code, signal) => {
        if (signal) {
          reject(
            new Error(
              `Process timed out or was terminated by ${signal}: ${command} ${args.join(" ")}`,
            ),
          );
          return;
        }

        resolve(code ?? 0);
      });
    });

    return {
      exitCode,
      stdout: await readFile(stdoutPath, "utf8"),
      stderr: await readFile(stderrPath, "utf8"),
    };
  } finally {
    await stdoutFile.close();
    await stderrFile.close();
  }
}

export async function captureRuneCliProcessResult(
  projectRoot: string,
  args: readonly string[],
): Promise<CapturedProcessResult> {
  const { runePackageRoot } = await ensureBuiltPackageEnvironment();

  return captureProcessResult(projectRoot, "node", [
    path.join(runePackageRoot, "dist", "cli.mjs"),
    ...args,
  ]);
}

export function captureBuiltCliResult(
  projectRoot: string,
  args: readonly string[],
): Promise<CapturedProcessResult> {
  return captureProcessResult(projectRoot, "node", ["dist/cli.mjs", ...args]);
}
