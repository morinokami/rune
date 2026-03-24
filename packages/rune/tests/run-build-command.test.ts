import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";

import { runRuneCli } from "../src/cli/rune-cli";
import { captureExitCode } from "./helpers";

const fixtureRootDirectories = new Set<string>();
const runePackageRoot = fileURLToPath(new URL("..", import.meta.url));
const vpBinaryPath = fileURLToPath(new URL("../node_modules/.bin/vp", import.meta.url));
let builtRunePackagePromise: Promise<void> | undefined;

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createBuildProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "rune-build-project-"));
  fixtureRootDirectories.add(projectRoot);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(projectRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return projectRoot;
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
  builtRunePackagePromise ??= runChildProcess(vpBinaryPath, ["pack"], runePackageRoot)
    .then(({ exitCode, stderr }) => {
      if (exitCode !== 0) {
        throw new Error(stderr || "Failed to build the local rune package");
      }
    })
    .catch((error) => {
      builtRunePackagePromise = undefined;
      throw error;
    });

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

async function captureRuneCli(argv: readonly string[], cwd?: string) {
  return captureExitCode(() => runRuneCli({ argv, cwd }));
}

test("runRuneCli shows help for `rune build --help`", async () => {
  const captured = await captureRuneCli(["build", "--help"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: rune build [options]\n");
  expect(captured.stderr).toBe("");
});

// Core runnable build behavior.
test("runRuneCli builds a fixture project and emits a runnable dist CLI", async () => {
  const projectRoot = await createBuildProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/message.ts": [
      "export function formatGreeting(name: string): string {",
      "  return `hello ${name}`;",
      "}",
    ].join("\n"),
    "src/commands/hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      'import { formatGreeting } from "../../message.ts";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(formatGreeting(ctx.options.name));",
      "  },",
      "});",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);

  expect(buildResult.exitCode).toBe(0);
  expect(buildResult.stdout).toContain(path.join(projectRoot, "dist", "cli.mjs"));
  expect(buildResult.stderr).toBe("");

  const manifestContents = await readFile(path.join(projectRoot, "dist", "manifest.json"), "utf8");
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

test("the built CLI shows help without invoking rune dev", async () => {
  const projectRoot = await createBuildProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);
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

test("runRuneCli build copies non-TypeScript files and skips declaration files", async () => {
  const projectRoot = await createBuildProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/config.json": JSON.stringify({ greeting: "hello" }, null, 2),
    "src/types.d.ts": "export interface Message { readonly text: string; }\n",
    "src/commands/hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);
  expect(buildResult.exitCode).toBe(0);
  expect(buildResult.stderr).toBe("");

  expect(await readFile(path.join(projectRoot, "dist", "config.json"), "utf8")).toBe(
    JSON.stringify({ greeting: "hello" }, null, 2),
  );
  expect(await pathExists(path.join(projectRoot, "dist", "types.d.ts"))).toBe(false);
});

// Production build isolation and optimization behavior.
test("runRuneCli build emits shared chunks for command dependencies", async () => {
  const projectRoot = await createBuildProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/shared.ts": [
      "export function formatMessage(name: string): string {",
      "  return `hello ${name}`;",
      "}",
    ].join("\n"),
    "src/commands/hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      'import { formatMessage } from "../../shared.ts";',
      "",
      "export default defineCommand({",
      "  async run() {",
      '    console.log(formatMessage("hello"));',
      "  },",
      "});",
    ].join("\n"),
    "src/commands/goodbye/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      'import { formatMessage } from "../../shared.ts";',
      "",
      "export default defineCommand({",
      "  async run() {",
      '    console.log(formatMessage("goodbye"));',
      "  },",
      "});",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);
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
    "src/commands/hello/index.ts": [
      "export default {",
      '  description: "Say hello",',
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("hello");',
      "  },",
      "};",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);

  expect(buildResult.exitCode).toBe(0);
  expect(buildResult.stderr).toBe("");

  const builtCommandResult = await runBuiltCli(projectRoot, ["hello"]);
  expect(builtCommandResult).toEqual({
    exitCode: 0,
    stdout: "hello\n",
    stderr: "",
  });
});

// Failure reporting.
test("runRuneCli build reports transpile failures", async () => {
  const projectRoot = await createBuildProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/broken.ts": "export const = 1;\n",
    "src/commands/hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      'import { value } from "../../broken.ts";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {",
      "    console.log(value);",
      "  },",
      "});",
    ].join("\n"),
  });
  await installRuneFixturePackage(projectRoot);

  const buildResult = await captureRuneCli(["build"], projectRoot);

  expect(buildResult.exitCode).toBe(1);
  expect(buildResult.stdout).toBe("");
  expect(buildResult.stderr).toContain("Failed to compile");
  expect(buildResult.stderr).toContain("src/broken.ts");
});
