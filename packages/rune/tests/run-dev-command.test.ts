import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";

import { runRuneCli } from "../src/cli/rune-cli";

const fixtureRootDirectories = new Set<string>();
const runeEntryPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createDevProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "rune-dev-project-"));
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

test("runRuneCli executes a simple command through `rune dev`", async () => {
  const projectRoot = await createDevProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      "export default {",
      '  description: "Say hello",',
      "  args: [],",
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`hello ${ctx.options.name}`);",
      "  },",
      "};",
    ].join("\n"),
  });

  const result = await runRuneCli({
    argv: ["dev", "hello", "--name", "rune"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello rune\n",
    stderr: "",
  });

  const manifestContents = await readFile(path.join(projectRoot, ".rune", "manifest.json"), "utf8");
  expect(manifestContents).toContain('"hello"');
});

test("runRuneCli shows help in dev mode and refreshes the manifest after command edits", async () => {
  const projectRoot = await createDevProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const firstResult = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(firstResult.exitCode).toBe(0);
  expect(firstResult.stdout).toContain("hello  Say hello");

  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    [
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hi",',
      "  async run() {},",
      "});",
    ].join("\n"),
  );

  const secondResult = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(secondResult.exitCode).toBe(0);
  expect(secondResult.stdout).toContain("hello  Say hi");
});

test("runRuneCli shows top-level help with no args", async () => {
  const result = await runRuneCli({ argv: [] });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: rune <command>\n"),
    stderr: "",
  });
});

test("runRuneCli shows dev help without loading a project", async () => {
  const result = await runRuneCli({
    argv: ["dev", "--help"],
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: rune dev [options] [command...]\n"),
    stderr: "",
  });
});

test("runRuneCli reports unknown top-level subcommands", async () => {
  const result = await runRuneCli({
    argv: ["unknown"],
  });

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Unknown rune command: unknown\n",
  });
});

test("runRuneCli only parses rune dev options before the command path", async () => {
  const projectRoot = await createDevProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    "src/commands/create/index.ts": [
      "export default {",
      "  args: [],",
      '  options: [{ name: "project", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`create ${ctx.options.project}`);",
      "  },",
      "};",
    ].join("\n"),
  });

  const result = await runRuneCli({
    argv: ["dev", "create", "--project", "myapp"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "create myapp\n",
    stderr: "",
  });
});

test("runRuneCli supports forwarding commands after `--` with an explicit project path", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-dev-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  const projectRoot = path.join(workspaceRoot, "fixture");

  await mkdir(path.join(projectRoot, "src", "commands", "hello"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "mycli" }, null, 2),
  );
  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    [
      "export default {",
      '  description: "Say hello",',
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("hello");',
      "  },",
      "};",
    ].join("\n"),
  );

  const result = await runRuneCli({
    argv: ["dev", "--project", "./fixture", "--", "hello"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello\n",
    stderr: "",
  });
});

test("runRuneCli preserves the caller cwd when using `--project` in dev mode", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-dev-workspace-"));
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
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
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

  const result = await runRuneCli({
    argv: ["dev", "--project", "../fixture", "--", "show-cwd"],
    cwd: invocationRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: `${invocationRoot}\n`,
    stderr: "",
  });
});

test("runRuneCli supports `--project=<path>` before the command path", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "rune-dev-workspace-"));
  fixtureRootDirectories.add(workspaceRoot);
  const projectRoot = path.join(workspaceRoot, "fixture");

  await mkdir(path.join(projectRoot, "src", "commands", "hello"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "mycli" }, null, 2),
  );
  await writeFile(
    path.join(projectRoot, "src", "commands", "hello", "index.ts"),
    [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("hello");',
      "  },",
      "};",
    ].join("\n"),
  );

  const result = await runRuneCli({
    argv: ["dev", "--project=./fixture", "hello"],
    cwd: workspaceRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "hello\n",
    stderr: "",
  });
});

test("runRuneCli uses the package bin name for help output", async () => {
  const projectRoot = await createDevProject({
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
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const result = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: runeplay <command>\n"),
    stderr: "",
  });
});

test("runRuneCli falls back to the unscoped package name when no bin field exists", async () => {
  const projectRoot = await createDevProject({
    "package.json": JSON.stringify({ name: "@scope/mycli" }, null, 2),
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const result = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining("Usage: mycli <command>\n"),
    stderr: "",
  });
});

test("runRuneCli falls back to the project directory name when package.json is missing", async () => {
  const projectRoot = await createDevProject({
    "src/commands/hello/index.ts": [
      `import { defineCommand } from ${JSON.stringify(runeEntryPath)};`,
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const result = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: expect.stringContaining(`Usage: ${path.basename(projectRoot)} <command>\n`),
    stderr: "",
  });
});

test("runRuneCli reports missing src/commands directories", async () => {
  const projectRoot = await createDevProject({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
  });

  const result = await runRuneCli({
    argv: ["dev"],
    cwd: projectRoot,
  });

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: expect.stringContaining("Commands directory not found:"),
  });
});
