import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, open, readFile, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";

import { runRuneCli } from "../../rune/src/cli/rune-cli";
import { SCAFFOLDED_RUNE_VERSION } from "../src/generated/scaffold-versions.ts";

const fixtureRootDirectories = new Set<string>();
const createRunePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const runePackageRoot = fileURLToPath(new URL("../../rune", import.meta.url));
const vpBinaryPath = fileURLToPath(new URL("../../../node_modules/.bin/vp", import.meta.url));
let builtRunePackagePromise: Promise<void> | undefined;

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createWorkspaceRoot(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "create-rune-app-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  return workspaceRoot;
}

async function runChildProcess(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_OPTIONS: "",
        VITEST: "",
        VITEST_POOL_ID: "",
        VITEST_WORKER_ID: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    childProcess.stdout.setEncoding("utf8");
    childProcess.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    childProcess.stderr.setEncoding("utf8");
    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function ensureBuiltRunePackage(): Promise<void> {
  builtRunePackagePromise ??= runChildProcess(vpBinaryPath, ["pack"], runePackageRoot).then(
    ({ exitCode, stderr }) => {
      if (exitCode !== 0) {
        throw new Error(stderr || "Failed to build the local rune package");
      }
    },
  );

  await builtRunePackagePromise;
}

async function installRuneFixturePackage(projectRoot: string): Promise<void> {
  await ensureBuiltRunePackage();

  const nodeModulesDirectory = path.join(projectRoot, "node_modules");
  const runeScopeDirectory = path.join(nodeModulesDirectory, "@rune-cli");
  const runePackageDirectory = path.join(runeScopeDirectory, "rune");

  await mkdir(runeScopeDirectory, { recursive: true });
  await symlink(runePackageRoot, runePackageDirectory, "dir");
}

async function createCreateRuneFixture(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "create-rune-app-project-"));
  fixtureRootDirectories.add(projectRoot);

  await cp(path.join(createRunePackageRoot, "src"), path.join(projectRoot, "src"), {
    recursive: true,
  });
  await cp(
    path.join(createRunePackageRoot, "package.json"),
    path.join(projectRoot, "package.json"),
  );

  return projectRoot;
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

async function runBuiltCli(
  cliPath: string,
  cwd: string,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdoutPath = path.join(cwd, ".create-rune-app.stdout");
  const stderrPath = path.join(cwd, ".create-rune-app.stderr");
  const stdoutFile = await open(stdoutPath, "w+");
  const stderrFile = await open(stderrPath, "w+");

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const childProcess = spawn("node", [cliPath, ...args], {
        cwd,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          VITEST: "",
          VITEST_POOL_ID: "",
          VITEST_WORKER_ID: "",
        },
        stdio: ["ignore", stdoutFile.fd, stderrFile.fd],
      });

      childProcess.on("error", reject);
      childProcess.on("close", (code) => {
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

test("create-rune-app shows root-command help through `rune dev`", async () => {
  const createRuneRoot = await createCreateRuneFixture();
  await installRuneFixturePackage(createRuneRoot);
  const workspaceRoot = await createWorkspaceRoot();

  const result = await runRuneCli({
    argv: ["dev", "--project", createRuneRoot, "--", "--help"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: create-rune-app <projectName>\n"),
    stderr: "",
  });
});

test("create-rune-app works as a self-hosted Rune project in dev mode", async () => {
  const createRuneRoot = await createCreateRuneFixture();
  await installRuneFixturePackage(createRuneRoot);
  const workspaceRoot = await createWorkspaceRoot();

  const result = await runRuneCli({
    argv: ["dev", "--project", createRuneRoot, "--", "mycli"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Created Rune project at mycli\n"),
    stderr: "",
  });

  const generatedProjectRoot = path.join(workspaceRoot, "mycli");
  const packageJson = JSON.parse(
    await readFile(path.join(generatedProjectRoot, "package.json"), "utf8"),
  ) as {
    name: string;
    bin: Record<string, string>;
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  expect(packageJson.name).toBe("mycli");
  expect(packageJson.bin).toEqual({ mycli: "dist/cli.mjs" });
  expect(packageJson.scripts).toEqual({
    dev: "rune dev",
    build: "rune build",
  });
  expect(packageJson.devDependencies["@rune-cli/rune"]).toBe(SCAFFOLDED_RUNE_VERSION);
  expect(await pathExists(path.join(generatedProjectRoot, "tsconfig.json"))).toBe(true);
  expect(await pathExists(path.join(generatedProjectRoot, ".gitignore"))).toBe(true);
  expect(
    await pathExists(path.join(generatedProjectRoot, "src", "commands", "hello", "index.ts")),
  ).toBe(true);

  await installRuneFixturePackage(generatedProjectRoot);

  const devResult = await runRuneCli({
    argv: ["dev", "hello"],
    cwd: generatedProjectRoot,
  });

  expect(devResult).toEqual({
    exitCode: 0,
    stdout: "hello from mycli\n",
    stderr: "",
  });

  const buildResult = await runRuneCli({
    argv: ["build"],
    cwd: generatedProjectRoot,
  });

  expect(buildResult).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining(path.join(generatedProjectRoot, "dist", "cli.mjs")),
    stderr: "",
  });
});

test("create-rune-app works as a self-hosted Rune project in build mode", async () => {
  const createRuneRoot = await createCreateRuneFixture();
  await installRuneFixturePackage(createRuneRoot);

  const buildResult = await runRuneCli({
    argv: ["build"],
    cwd: createRuneRoot,
  });

  expect(buildResult).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining(path.join(createRuneRoot, "dist", "cli.mjs")),
    stderr: "",
  });

  const workspaceRoot = await createWorkspaceRoot();
  const helpResult = await runBuiltCli(
    path.join(createRuneRoot, "dist", "cli.mjs"),
    workspaceRoot,
    ["--help"],
  );

  expect(helpResult).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: create-rune-app <projectName>\n"),
    stderr: "",
  });

  const builtCommandResult = await runBuiltCli(
    path.join(createRuneRoot, "dist", "cli.mjs"),
    workspaceRoot,
    ["mycli"],
  );

  expect(builtCommandResult).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Created Rune project at mycli\n"),
    stderr: "",
  });
  expect(await pathExists(path.join(workspaceRoot, "mycli", "package.json"))).toBe(true);
});

test("create-rune-app reports an existing target directory in dev mode", async () => {
  const createRuneRoot = await createCreateRuneFixture();
  await installRuneFixturePackage(createRuneRoot);
  const workspaceRoot = await createWorkspaceRoot();
  await mkdir(path.join(workspaceRoot, "mycli"), { recursive: true });

  const result = await runRuneCli({
    argv: ["dev", "--project", createRuneRoot, "--", "mycli"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: `Target directory already exists: ${path.join(workspaceRoot, "mycli")}\n`,
  });
});

test("create-rune-app scaffolds scoped package names with the unscoped CLI binary name", async () => {
  const createRuneRoot = await createCreateRuneFixture();
  await installRuneFixturePackage(createRuneRoot);
  const workspaceRoot = await createWorkspaceRoot();

  const result = await runRuneCli({
    argv: ["dev", "--project", createRuneRoot, "--", "@scope/mycli"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Created Rune project at @scope/mycli\n"),
    stderr: "",
  });

  const generatedProjectRoot = path.join(workspaceRoot, "@scope", "mycli");
  const packageJson = JSON.parse(
    await readFile(path.join(generatedProjectRoot, "package.json"), "utf8"),
  ) as {
    name: string;
    bin: Record<string, string>;
  };

  expect(packageJson.name).toBe("@scope/mycli");
  expect(packageJson.bin).toEqual({ mycli: "dist/cli.mjs" });

  await installRuneFixturePackage(generatedProjectRoot);

  const devResult = await runRuneCli({
    argv: ["dev", "hello"],
    cwd: generatedProjectRoot,
  });

  expect(devResult).toEqual({
    exitCode: 0,
    stdout: "hello from mycli\n",
    stderr: "",
  });
});
