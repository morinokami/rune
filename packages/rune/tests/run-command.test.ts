import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";

import { runRuneCli } from "../src/cli/rune-cli";
import { captureExitCode } from "./helpers";

const fixtureRootDirectories = new Set<string>();
const coreEntryPath = fileURLToPath(new URL("../../core/src/index.ts", import.meta.url));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createCommandModule(lines: readonly string[]): string {
  return [
    `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
    "",
    "export default defineCommand({",
    ...lines,
    "});",
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createRunProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "rune-run-project-"));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function captureRuneCli(argv: readonly string[], cwd?: string) {
  return captureExitCode(() => runRuneCli({ argv, cwd }));
}

// ---------------------------------------------------------------------------
// Run execution
// ---------------------------------------------------------------------------

test("runRuneCli executes a simple command through `rune run`", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello/index.ts": createCommandModule([
      '  description: "Say hello",',
      "  args: [],",
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`hello ${ctx.options.name}`);",
      "  },",
    ]),
  });

  const captured = await captureRuneCli(["run", "hello", "--name", "rune"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("hello rune\n");
  expect(captured.stderr).toBe("");

  const manifestContents = await readFile(path.join(projectRoot, ".rune", "manifest.json"), "utf8");
  expect(manifestContents).toContain('"hello"');
});

test("runRuneCli shows help in run mode and refreshes the manifest after command edits", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const firstResult = await captureRuneCli(["run"], projectRoot);

  expect(firstResult.exitCode).toBe(0);
  expect(firstResult.stdout).toContain("hello  Say hello");
  expect(firstResult.stderr).toBe("");

  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hi",',
      "  async run() {},",
      "});",
    ].join("\n"),
  );

  const secondResult = await captureRuneCli(["run"], projectRoot);

  expect(secondResult.exitCode).toBe(0);
  expect(secondResult.stdout).toContain("hello  Say hi");
  expect(secondResult.stderr).toBe("");
});

// ---------------------------------------------------------------------------
// Top-level CLI behavior
// ---------------------------------------------------------------------------

test("runRuneCli shows top-level help with no args", async () => {
  const captured = await captureRuneCli([]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: rune <command>\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli shows run help without loading a project", async () => {
  const captured = await captureRuneCli(["run", "--help"]);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: rune run [options] [command...]\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli reports unknown top-level subcommands", async () => {
  const captured = await captureRuneCli(["unknown"]);

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe("Unknown command: unknown. Available commands: build, run\n");
});

// ---------------------------------------------------------------------------
// Run subcommand parsing
// ---------------------------------------------------------------------------

test("runRuneCli only parses rune run options before the command path", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/create/index.ts": createCommandModule([
      "  args: [],",
      '  options: [{ name: "project", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`create ${ctx.options.project}`);",
      "  },",
    ]),
  });

  const captured = await captureRuneCli(["run", "create", "--project", "myapp"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("create myapp\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli supports forwarding commands after `--` with an explicit project path", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-run-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  const projectRoot = path.join(workspaceRoot, "fixture");

  await mkdir(path.join(projectRoot, "src", "commands", "hello"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "mycli" }, null, 2),
  );
  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    createCommandModule([
      '  description: "Say hello",',
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("hello");',
      "  },",
    ]),
  );

  const captured = await captureRuneCli(
    ["run", "--project", "./fixture", "--", "hello"],
    workspaceRoot,
  );

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("hello\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli preserves the caller cwd when using `--project` in run mode", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-run-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  const projectRoot = path.join(workspaceRoot, "fixture");

  await mkdir(path.join(projectRoot, "src", "commands", "show-cwd"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "mycli" }, null, 2),
  );
  await writeFile(
    path.join(projectRoot, "src", "commands", "show-cwd", "index.ts"),
    [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      "  async run(ctx) {",
      "    console.log(ctx.cwd);",
      "  },",
      "});",
    ].join("\n"),
  );

  const invocationRoot = path.join(workspaceRoot, "invocation");
  await mkdir(invocationRoot, { recursive: true });

  const captured = await captureRuneCli(
    ["run", "--project", "../fixture", "--", "show-cwd"],
    invocationRoot,
  );

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe(`${invocationRoot}\n`);
  expect(captured.stderr).toBe("");
});

test("runRuneCli supports `--project=<path>` before the command path", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-run-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  const projectRoot = path.join(workspaceRoot, "fixture");

  await mkdir(path.join(projectRoot, "src", "commands", "hello"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "mycli" }, null, 2),
  );
  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    createCommandModule([
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("hello");',
      "  },",
    ]),
  );

  const captured = await captureRuneCli(["run", "--project=./fixture", "hello"], workspaceRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("hello\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli reports missing values for `rune run --project`", async () => {
  const captured = await captureRuneCli(["run", "--project"]);

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe("Missing value for --project. Usage: --project <path>\n");
});

// ---------------------------------------------------------------------------
// CLI name resolution
// ---------------------------------------------------------------------------

test("runRuneCli uses the package bin name for help output", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify(
      {
        name: "@scope/mycli",
        bin: {
          runeplay: "./dist/cli.mjs",
        },
      },
      null,
      2,
    ),
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const captured = await captureRuneCli(["run"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: runeplay <command>\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli falls back to the unscoped package name when no bin field exists", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "@scope/mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const captured = await captureRuneCli(["run"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: mycli <command>\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli falls back to the project directory name when package.json is missing", async () => {
  const projectRoot = await createRunProject({
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const captured = await captureRuneCli(["run"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain(`Usage: ${path.basename(projectRoot)} <command>\n`);
  expect(captured.stderr).toBe("");
});

// ---------------------------------------------------------------------------
// Alternate command layouts & runtime errors
// ---------------------------------------------------------------------------

test("runRuneCli executes a bare file command through `rune run`", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello.ts": createCommandModule([
      '  description: "Say hello",',
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`hello ${ctx.options.name}`);",
      "  },",
    ]),
  });

  const captured = await captureRuneCli(["run", "hello", "--name", "rune"], projectRoot);

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("hello rune\n");
  expect(captured.stderr).toBe("");
});

test("runRuneCli reports missing src/commands directories", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
  });

  const captured = await captureRuneCli(["run"], projectRoot);

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toContain("Commands directory not found at src/commands");
});

test("runRuneCli reports plain object default exports with a clear error", async () => {
  const projectRoot = await createRunProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/plain/index.ts": [
      "export default {",
      '  description: "plain",',
      "  async run() {",
      '    console.log("hi");',
      "  },",
      "};",
    ].join("\n"),
  });

  const captured = await captureRuneCli(["run", "plain"], projectRoot);

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe(
    "Command module must export a value created with defineCommand(). Got a plain object.\n",
  );
});
