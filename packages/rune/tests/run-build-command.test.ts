import { spawn } from "node:child_process";
import { cp, mkdir, open, realpath, readFile, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, test } from "vite-plus/test";

import { runRuneCli } from "../src/cli/rune-cli";
import {
  captureCommandResult,
  createTempFixtureManager,
  pathExists,
  type FixtureFiles,
} from "./helpers";

const buildProjectFixtures = createTempFixtureManager({
  cleanupRetries: 3,
  cleanupRetryDelayMs: 50,
});
const packagedWorkspaces = createTempFixtureManager({
  cleanupRetries: 3,
  cleanupRetryDelayMs: 50,
});
const sourceCorePackageRoot = fileURLToPath(new URL("../../core", import.meta.url));
const sourceRunePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const vpBinaryPath = fileURLToPath(new URL("../node_modules/.bin/vp", import.meta.url));
let builtPackageEnvironmentPromise:
  | Promise<{ corePackageRoot: string; runePackageRoot: string }>
  | undefined;

const PACKAGED_ENTRIES = ["package.json", "src", "tsconfig.json", "vite.config.ts"];

interface BuildCommandModuleSpec {
  readonly description?: string;
  readonly args?: string;
  readonly options?: string;
  readonly importLines?: readonly string[];
  readonly runSignature?: string;
  readonly runBodyLines?: readonly string[];
}

// Test setup

afterEach(async () => {
  await buildProjectFixtures.cleanup();
});

afterAll(async () => {
  await packagedWorkspaces.cleanup();
});

// Fixtures & process helpers

function createBuildCommandModule({
  description,
  args,
  options,
  importLines = [],
  runSignature = "async run()",
  runBodyLines = [],
}: BuildCommandModuleSpec): string {
  const moduleLines = ['import { defineCommand } from "@rune-cli/rune";', ...importLines, ""];

  moduleLines.push("export default defineCommand({");
  if (description !== undefined) {
    moduleLines.push(`  description: ${JSON.stringify(description)},`);
  }
  if (args !== undefined) {
    moduleLines.push(`  args: ${args},`);
  }
  if (options !== undefined) {
    moduleLines.push(`  options: ${options},`);
  }

  if (runBodyLines.length === 0) {
    moduleLines.push(`  ${runSignature} {},`);
  } else {
    moduleLines.push(`  ${runSignature} {`);
    moduleLines.push(...runBodyLines.map((line) => `    ${line}`));
    moduleLines.push("  },");
  }

  moduleLines.push("});");
  return moduleLines.join("\n");
}

async function createBuildProject(files: FixtureFiles): Promise<string> {
  const { fixtureDirectory } = await buildProjectFixtures.createFixture({
    prefix: "rune-build-project-",
    files,
  });
  return fixtureDirectory;
}

async function createBuildWorkspaceProject(files: FixtureFiles): Promise<{
  readonly workspaceRoot: string;
  readonly projectRoot: string;
}> {
  const { rootDirectory, fixtureDirectory } = await buildProjectFixtures.createFixture({
    prefix: "rune-build-workspace-",
    rootSubdirectory: "fixture",
    files,
  });

  return {
    workspaceRoot: rootDirectory,
    projectRoot: fixtureDirectory,
  };
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

// Packaging helpers

interface TestPackageJson {
  readonly dependencies?: Readonly<Record<string, string>> | undefined;
  readonly devDependencies?: Readonly<Record<string, string>> | undefined;
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
  overrides: Readonly<Record<string, string>> = {},
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
    const overriddenDependencyPath = overrides[dependencyName];

    if (overriddenDependencyPath) {
      await mkdir(path.dirname(targetDependencyPath), { recursive: true });
      await symlink(overriddenDependencyPath, targetDependencyPath, "dir");
      continue;
    }

    await symlinkPath(path.join(sourceNodeModulesDirectory, dependencyName), targetDependencyPath);
  }
}

async function ensureBuiltPackageEnvironment(): Promise<{
  corePackageRoot: string;
  runePackageRoot: string;
}> {
  builtPackageEnvironmentPromise ??= (async () => {
    const packagedWorkspaceRoot = await packagedWorkspaces.createRoot("rune-packages-");

    const corePackageRoot = await copyPackageForPack(sourceCorePackageRoot, packagedWorkspaceRoot);
    await linkPackageDependencies(sourceCorePackageRoot, corePackageRoot);

    const coreBuildResult = await runChildProcess(vpBinaryPath, ["pack"], corePackageRoot);
    if (coreBuildResult.exitCode !== 0) {
      throw new Error(coreBuildResult.stderr || "Failed to build the isolated core package");
    }

    const runePackageRoot = await copyPackageForPack(sourceRunePackageRoot, packagedWorkspaceRoot);
    await linkPackageDependencies(sourceRunePackageRoot, runePackageRoot, {
      "@rune-cli/core": corePackageRoot,
    });

    const runeBuildResult = await runChildProcess(vpBinaryPath, ["pack"], runePackageRoot);
    if (runeBuildResult.exitCode !== 0) {
      throw new Error(runeBuildResult.stderr || "Failed to build the isolated rune package");
    }

    return { corePackageRoot, runePackageRoot };
  })().catch((error) => {
    builtPackageEnvironmentPromise = undefined;
    throw error;
  });

  return await builtPackageEnvironmentPromise;
}

async function installRuneFixturePackage(projectRoot: string): Promise<void> {
  const { runePackageRoot } = await ensureBuiltPackageEnvironment();

  const nodeModulesDirectory = path.join(projectRoot, "node_modules");
  const runeScopeDirectory = path.join(nodeModulesDirectory, "@rune-cli");
  const runePackageDirectory = path.join(runeScopeDirectory, "rune");

  await mkdir(runeScopeDirectory, { recursive: true });
  await symlink(runePackageRoot, runePackageDirectory, "dir");
}

async function runBuiltCli(
  projectRoot: string,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stdoutPath = path.join(projectRoot, ".built-cli.stdout");
  const stderrPath = path.join(projectRoot, ".built-cli.stderr");
  const stdoutFile = await open(stdoutPath, "w+");
  const stderrFile = await open(stderrPath, "w+");

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const childProcess = spawn("node", ["dist/cli.mjs", ...args], {
        cwd: projectRoot,
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

async function captureRuneCliResult(argv: readonly string[], cwd?: string) {
  return captureCommandResult(() => runRuneCli({ argv, cwd }));
}

describe("build subcommand parsing", () => {
  test("runRuneCli shows help for `rune build --help`", async () => {
    const captured = await captureRuneCliResult(["build", "--help"]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune build [options]\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli supports `rune build --project=<path>`", async () => {
    const { workspaceRoot, projectRoot } = await createBuildWorkspaceProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const captured = await captureRuneCliResult(["build", "--project=./fixture"], workspaceRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain(path.join(projectRoot, "dist", "cli.mjs"));
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reports missing values for `rune build --project`", async () => {
    const captured = await captureRuneCliResult(["build", "--project"]);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe("Missing value for --project. Usage: --project <path>\n");
  });

  test("runRuneCli rejects unexpected positional arguments for `rune build`", async () => {
    const captured = await captureRuneCliResult(["build", "extra"]);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe("Unexpected argument for rune build: extra\n");
  });
});

describe("build output", () => {
  test("runRuneCli builds a fixture project and emits a runnable dist CLI", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/message.ts": [
        "export function formatGreeting(name: string): string {",
        "  return `hello ${name}`;",
        "}",
      ].join("\n"),
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
        options: '[{ name: "name", type: "string", required: true }]',
        importLines: ['import { formatGreeting } from "../../message.ts";'],
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(formatGreeting(ctx.options.name));"],
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stdout).toContain(path.join(projectRoot, "dist", "cli.mjs"));
    expect(buildResult.stderr).toBe("");

    const manifestContents = await readFile(
      path.join(projectRoot, "dist", "manifest.json"),
      "utf8",
    );
    expect(manifestContents).toContain('"sourceFilePath": "commands/hello/index.mjs"');
    expect(await readFile(path.join(projectRoot, "dist", "cli.mjs"), "utf8")).not.toContain(
      "@rune-cli/rune/runtime",
    );
    expect(
      await readFile(path.join(projectRoot, "dist", "commands", "hello", "index.mjs"), "utf8"),
    ).not.toContain("@rune-cli/rune");

    const builtCommandResult = await runBuiltCli(projectRoot, ["hello", "--name", "rune"]);

    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
  });

  test("the built CLI shows help without invoking rune run", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const rootHelpResult = await runBuiltCli(projectRoot, []);
    expect(rootHelpResult.exitCode).toBe(0);
    expect(rootHelpResult.stdout).toContain("Usage: mycli <command>\n");
    expect(rootHelpResult.stdout).toContain("hello  Say hello");

    const commandHelpResult = await runBuiltCli(projectRoot, ["hello", "--help"]);
    expect(commandHelpResult.exitCode).toBe(0);
    expect(commandHelpResult.stdout).toContain("Usage: mycli hello");
    expect(commandHelpResult.stdout).toContain("Description:\n  Say hello");
  });

  test("runRuneCli builds a bare file command and emits the correct dist path", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello.ts": createBuildCommandModule({
        description: "Say hello",
        options: '[{ name: "name", type: "string", required: true }]',
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(`hello ${ctx.options.name}`);"],
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const manifestContents = await readFile(
      path.join(projectRoot, "dist", "manifest.json"),
      "utf8",
    );
    expect(manifestContents).toContain('"sourceFilePath": "commands/hello.mjs"');
    expect(await pathExists(path.join(projectRoot, "dist", "commands", "hello.mjs"))).toBe(true);

    const builtCommandResult = await runBuiltCli(projectRoot, ["hello", "--name", "rune"]);

    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
  });

  test("runRuneCli build copies non-TypeScript files and skips declaration files", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/config.json": JSON.stringify({ greeting: "hello" }, null, 2),
      "src/types.d.ts": "export interface Message { readonly text: string; }\n",
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    expect(await readFile(path.join(projectRoot, "dist", "config.json"), "utf8")).toBe(
      JSON.stringify({ greeting: "hello" }, null, 2),
    );
    expect(await pathExists(path.join(projectRoot, "dist", "types.d.ts"))).toBe(false);
  });
});

describe("build isolation and optimization", () => {
  test("runRuneCli build emits shared chunks for command dependencies", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/shared.ts": [
        "export function formatMessage(name: string): string {",
        "  return `hello ${name}`;",
        "}",
      ].join("\n"),
      "src/commands/hello/index.ts": createBuildCommandModule({
        importLines: ['import { formatMessage } from "../../shared.ts";'],
        runBodyLines: ['console.log(formatMessage("hello"));'],
      }),
      "src/commands/goodbye/index.ts": createBuildCommandModule({
        importLines: ['import { formatMessage } from "../../shared.ts";'],
        runBodyLines: ['console.log(formatMessage("goodbye"));'],
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    expect(await pathExists(path.join(projectRoot, "dist", "shared.js"))).toBe(false);
    expect((await readdir(path.join(projectRoot, "dist", "chunks"))).length).toBeGreaterThan(0);
  });

  test("runRuneCli build does not apply the project tsconfig to the built CLI entry", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@rune-cli/core": ["./broken-core.ts"],
            },
          },
        },
        null,
        2,
      ),
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
        args: "[]",
        options: "[]",
        runBodyLines: ['console.log("hello");'],
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const builtCommandResult = await runBuiltCli(projectRoot, ["hello"]);
    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello\n",
      stderr: "",
    });
  });
});

describe("failure reporting", () => {
  test("runRuneCli build reports transpile failures", async () => {
    const projectRoot = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/broken.ts": "export const = 1;\n",
      "src/commands/hello/index.ts": createBuildCommandModule({
        description: "Say hello",
        importLines: ['import { value } from "../../broken.ts";'],
        runBodyLines: ["console.log(value);"],
      }),
    });
    await installRuneFixturePackage(projectRoot);

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(1);
    expect(buildResult.stdout).toBe("");
    expect(buildResult.stderr).toContain("Failed to compile");
    expect(buildResult.stderr).toContain("src/broken.ts");
  });
});
