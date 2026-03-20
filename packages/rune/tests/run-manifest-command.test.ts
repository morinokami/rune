import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { runManifestCommand } from "../src/manifest/run-manifest-command";

const fixtureRootDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
  delete (globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules;
});

async function createRuntimeFixture(files: Readonly<Record<string, string>>): Promise<{
  readonly rootDirectory: string;
  readonly manifest: CommandManifest;
}> {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "rune-runtime-"));
  fixtureRootDirectories.add(rootDirectory);
  // Each test gets unique module URLs so dynamic import caching does not leak between cases.

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(rootDirectory, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  const manifest: CommandManifest = {
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["project"],
      },
      {
        pathSegments: ["project"],
        kind: "group",
        childNames: ["create", "list"],
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(rootDirectory, "commands", "project", "create", "index.mjs"),
        childNames: [],
        description: "Create a project",
      },
      {
        pathSegments: ["project", "list"],
        kind: "command",
        sourceFilePath: path.join(rootDirectory, "commands", "project", "list", "index.mjs"),
        childNames: [],
        description: "List projects",
      },
    ],
  };

  return {
    rootDirectory,
    manifest,
  };
}

test("runManifestCommand executes the matched leaf command through the router", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      '  description: "Create a project",',
      '  args: [{ name: "id", type: "string", required: true }],',
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run(ctx) {",
      "    console.log(`name=${ctx.options.name}`);",
      "    console.log(`id=${ctx.args.id}`);",
      "    console.log(`cwd=${ctx.cwd}`);",
      '    console.log(`raw=${ctx.rawArgs.join(",")}`);',
      "  },",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      '  description: "List projects",',
      "  args: [],",
      "  options: [],",
      "  async run() {",
      '    console.log("list");',
      "  },",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project", "create", "42", "--name", "rune"],
    cliName: "mycli",
    cwd: "/tmp/rune-project",
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: ["name=rune", "id=42", "cwd=/tmp/rune-project", "raw=42,--name,rune", ""].join("\n"),
    stderr: "",
  });
});

test("runManifestCommand loads only the matched leaf module", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project", "create"],
    cliName: "mycli",
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "",
    stderr: "",
  });
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
    "create",
  ]);
});

test("runManifestCommand returns help output without loading child commands for groups", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project"],
    cliName: "mycli",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: mycli project <command>");
  expect(result.stderr).toBe("");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
});

test("runManifestCommand returns parse failures as non-zero stderr results", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      '  description: "Create a project",',
      "  args: [],",
      '  options: [{ name: "name", type: "string", required: true }],',
      "  async run() {",
      '    console.log("should not run");',
      "  },",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project", "create"],
    cliName: "mycli",
  });

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Missing required option:\n\n  --name <string>\n",
  });
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
    "create",
  ]);
});

test("runManifestCommand returns leaf help through the routed command path", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      '  description: "Create a project",',
      '  args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],',
      '  options: [{ name: "force", type: "boolean", alias: "f", description: "Overwrite existing state" }],',
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project", "create", "--help"],
    cliName: "mycli",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage: mycli project create <id> [options]");
  expect(result.stdout).toContain("-f, --force <boolean>");
  expect(result.stderr).toBe("");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
    "create",
  ]);
});

test("runManifestCommand returns unknown command failures with suggestions", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("create");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "globalThis.__runeLoadedModules ??= [];",
      'globalThis.__runeLoadedModules.push("list");',
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const result = await runManifestCommand({
    manifest,
    rawArgs: ["project", "cretae"],
    cliName: "mycli",
  });

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Unknown command: mycli project cretae");
  expect(result.stderr).toContain("create");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
});
