import { spawn } from "node:child_process";
import { cp, mkdir, open, realpath, readFile, readdir, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import {
  captureRuneCliResult,
  createTempFixtureManager,
  pathExists,
  setupTempFixtures,
} from "./helpers";

const buildProjectFixtures = setupTempFixtures();
const packagedWorkspaces = createTempFixtureManager();
const sourceCorePackageRoot = fileURLToPath(new URL("../../core", import.meta.url));
const sourceRunePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const vpBinaryPath = fileURLToPath(new URL("../node_modules/.bin/vp", import.meta.url));
let builtPackageEnvironmentPromise:
  | Promise<{ corePackageRoot: string; runePackageRoot: string }>
  | undefined;

const PACKAGED_ENTRIES = ["package.json", "src", "tsconfig.json", "vite.config.ts"];

beforeAll(async () => {
  await ensureBuiltPackageEnvironment();
});

afterAll(async () => {
  await packagedWorkspaces.cleanup();
});

// ---------------------------------------------------------------------------
// Packaging helpers
// ---------------------------------------------------------------------------

async function runVpPack(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(vpBinaryPath, ["pack"], {
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
    const packagedWorkspaceRoot = await packagedWorkspaces.createRoot();

    const corePackageRoot = await copyPackageForPack(sourceCorePackageRoot, packagedWorkspaceRoot);
    await linkPackageDependencies(sourceCorePackageRoot, corePackageRoot);

    await runVpPack(corePackageRoot);

    const runePackageRoot = await copyPackageForPack(sourceRunePackageRoot, packagedWorkspaceRoot);
    await linkPackageDependencies(sourceRunePackageRoot, runePackageRoot, {
      "@rune-cli/core": corePackageRoot,
    });

    await runVpPack(runePackageRoot);

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

// ---------------------------------------------------------------------------
// Command execution helpers
// ---------------------------------------------------------------------------

async function captureBuiltCliResult(
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

async function createBuildProject(
  files: Readonly<Record<string, string>>,
  options?: { readonly fixturePath?: string; readonly packageName?: string },
): Promise<{ readonly workspaceRoot: string; readonly projectRoot: string }> {
  const { rootDirectory, fixtureDirectory } = await buildProjectFixtures.createFixture({
    fixturePath: options?.fixturePath,
    files: {
      "package.json": JSON.stringify({ name: options?.packageName ?? "mycli" }, null, 2),
      ...files,
    },
  });
  await installRuneFixturePackage(fixtureDirectory);
  return { workspaceRoot: rootDirectory, projectRoot: fixtureDirectory };
}

describe("build subcommand parsing", () => {
  test("runRuneCli shows help for `rune build --help`", async () => {
    const captured = await captureRuneCliResult(["build", "--help"]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune build [options]\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli supports `rune build --project=<path>`", async () => {
    const { workspaceRoot, projectRoot } = await createBuildProject(
      {
        "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
      },
      { fixturePath: "fixture" },
    );

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
    const { projectRoot } = await createBuildProject({
      "src/message.ts": [
        "export function formatGreeting(name: string): string {",
        "  return `hello ${name}`;",
        "}",
      ].join("\n"),
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";
import { formatGreeting } from "../../message.ts";

export default defineCommand({
  description: "Say hello",
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    console.log(formatGreeting(ctx.options.name));
  },
});
`,
    });

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

    const builtCommandResult = await captureBuiltCliResult(projectRoot, [
      "hello",
      "--name",
      "rune",
    ]);

    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
  });

  test("the built CLI shows help without invoking rune run", async () => {
    const { projectRoot } = await createBuildProject({
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const rootHelpResult = await captureBuiltCliResult(projectRoot, []);
    expect(rootHelpResult.exitCode).toBe(0);
    expect(rootHelpResult.stdout).toContain("Usage: mycli <command>\n");
    expect(rootHelpResult.stdout).toContain("hello  Say hello");

    const commandHelpResult = await captureBuiltCliResult(projectRoot, ["hello", "--help"]);
    expect(commandHelpResult.exitCode).toBe(0);
    expect(commandHelpResult.stdout).toContain("Usage: mycli hello");
    expect(commandHelpResult.stdout).toContain("Description:\n  Say hello");
  });

  test("runRuneCli builds a bare file command and emits the correct dist path", async () => {
    const { projectRoot } = await createBuildProject({
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    console.log(\`hello \${ctx.options.name}\`);
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const manifestContents = await readFile(
      path.join(projectRoot, "dist", "manifest.json"),
      "utf8",
    );
    expect(manifestContents).toContain('"sourceFilePath": "commands/hello.mjs"');
    expect(await pathExists(path.join(projectRoot, "dist", "commands", "hello.mjs"))).toBe(true);

    const builtCommandResult = await captureBuiltCliResult(projectRoot, [
      "hello",
      "--name",
      "rune",
    ]);

    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
  });

  test("runRuneCli build copies non-TypeScript files and skips declaration files", async () => {
    const { projectRoot } = await createBuildProject({
      "src/config.json": JSON.stringify({ greeting: "hello" }, null, 2),
      "src/types.d.ts": "export interface Message { readonly text: string; }\n",
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    const captured = await captureRuneCliResult(["build"], projectRoot);
    expect(captured.exitCode).toBe(0);
    expect(captured.stderr).toBe("");

    expect(await readFile(path.join(projectRoot, "dist", "config.json"), "utf8")).toBe(
      JSON.stringify({ greeting: "hello" }, null, 2),
    );
    expect(await pathExists(path.join(projectRoot, "dist", "types.d.ts"))).toBe(false);
  });
});

describe("build isolation and optimization", () => {
  test("runRuneCli build emits shared chunks for command dependencies", async () => {
    const { projectRoot } = await createBuildProject({
      "src/shared.ts": [
        "export function formatMessage(name: string): string {",
        "  return `hello ${name}`;",
        "}",
      ].join("\n"),
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";
import { formatMessage } from "../../shared.ts";

export default defineCommand({
  async run() {
    console.log(formatMessage("hello"));
  },
});
`,
      "src/commands/goodbye/index.ts": `import { defineCommand } from "@rune-cli/rune";
import { formatMessage } from "../../shared.ts";

export default defineCommand({
  async run() {
    console.log(formatMessage("goodbye"));
  },
});
`,
    });

    const captured = await captureRuneCliResult(["build"], projectRoot);
    expect(captured.exitCode).toBe(0);
    expect(captured.stderr).toBe("");

    expect(await pathExists(path.join(projectRoot, "dist", "shared.js"))).toBe(false);
    expect((await readdir(path.join(projectRoot, "dist", "chunks"))).length).toBeGreaterThan(0);
  });

  test("runRuneCli build does not apply the project tsconfig to the built CLI entry", async () => {
    const { projectRoot } = await createBuildProject({
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
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  args: [],
  options: [],
  async run() {
    console.log("hello");
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);

    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const builtCommandResult = await captureBuiltCliResult(projectRoot, ["hello"]);
    expect(builtCommandResult).toEqual({
      exitCode: 0,
      stdout: "hello\n",
      stderr: "",
    });
  });
});

describe("failure reporting", () => {
  test("runRuneCli build reports transpile failures", async () => {
    const { projectRoot } = await createBuildProject({
      "src/broken.ts": "export const = 1;\n",
      "src/commands/hello/index.ts": `import { defineCommand } from "@rune-cli/rune";
import { value } from "../../broken.ts";

export default defineCommand({
  description: "Say hello",
  async run() {
    console.log(value);
  },
});
`,
    });

    const captured = await captureRuneCliResult(["build"], projectRoot);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toContain("Failed to compile");
    expect(captured.stderr).toContain("src/broken.ts");
  });
});
