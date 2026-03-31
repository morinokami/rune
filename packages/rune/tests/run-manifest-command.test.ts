import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { runManifestCommand } from "../src/manifest/runtime/run-manifest-command";
import { captureExitCode } from "./helpers";

const fixtureRootDirectories = new Set<string>();
const coreEntryPath = fileURLToPath(new URL("../../core/src/index.ts", import.meta.url));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createDefinedCommandModule(
  bodyLines: readonly string[],
  preludeLines: readonly string[] = [],
): string {
  const lines = [`import { defineCommand } from ${JSON.stringify(coreEntryPath)};`, ""];

  if (preludeLines.length > 0) {
    lines.push(...preludeLines, "");
  }

  lines.push("export default defineCommand({", ...bodyLines, "});");
  return lines.join("\n");
}

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
  delete (globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules;
});

// ---------------------------------------------------------------------------
// Runtime fixture construction
// ---------------------------------------------------------------------------

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
        aliases: [],
      },
      {
        pathSegments: ["project"],
        kind: "group",
        childNames: ["create", "list"],
        aliases: [],
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(rootDirectory, "commands", "project", "create", "index.mjs"),
        childNames: [],
        aliases: [],
        description: "Create a project",
      },
      {
        pathSegments: ["project", "list"],
        kind: "command",
        sourceFilePath: path.join(rootDirectory, "commands", "project", "list", "index.mjs"),
        childNames: [],
        aliases: [],
        description: "List projects",
      },
    ],
  };

  return {
    rootDirectory,
    manifest,
  };
}

async function captureRunManifestCommand(options: Parameters<typeof runManifestCommand>[0]) {
  return captureExitCode(() => runManifestCommand(options));
}

// ---------------------------------------------------------------------------
// Routed execution
// ---------------------------------------------------------------------------

test("runManifestCommand executes the matched leaf command through the router", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": createDefinedCommandModule(
      [
        '  description: "Create a project",',
        '  args: [{ name: "id", type: "string", required: true }],',
        '  options: [{ name: "name", type: "string", required: true }],',
        "  async run(ctx) {",
        "    console.log(`name=${ctx.options.name}`);",
        "    console.log(`id=${ctx.args.id}`);",
        "    console.log(`cwd=${ctx.cwd}`);",
        '    console.log(`raw=${ctx.rawArgs.join(",")}`);',
        "  },",
      ],
      ["globalThis.__runeLoadedModules ??= [];", 'globalThis.__runeLoadedModules.push("create");'],
    ),
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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "create", "42", "--name", "rune"],
    cliName: "mycli",
    cwd: "/tmp/rune-project",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe(
    ["name=rune", "id=42", "cwd=/tmp/rune-project", "raw=42,--name,rune", ""].join("\n"),
  );
  expect(captured.stderr).toBe("");
});

test("runManifestCommand loads only the matched leaf module", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": createDefinedCommandModule(
      ["  args: [],", "  options: [],", "  async run() {},"],
      ["globalThis.__runeLoadedModules ??= [];", 'globalThis.__runeLoadedModules.push("create");'],
    ),
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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "create"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe("");
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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: mycli project <command>");
  expect(captured.stderr).toBe("");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Help & parse failures
// ---------------------------------------------------------------------------

test("runManifestCommand returns parse failures as non-zero stderr results", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": createDefinedCommandModule(
      [
        '  description: "Create a project",',
        "  args: [],",
        '  options: [{ name: "name", type: "string", required: true }],',
        "  async run() {",
        '    console.log("should not run");',
        "  },",
      ],
      ["globalThis.__runeLoadedModules ??= [];", 'globalThis.__runeLoadedModules.push("create");'],
    ),
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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "create"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe("Missing required option:\n\n  --name <string>\n");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
    "create",
  ]);
});

test("runManifestCommand returns leaf help through the routed command path", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": createDefinedCommandModule(
      [
        '  description: "Create a project",',
        '  args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],',
        '  options: [{ name: "force", type: "boolean", short: "f", description: "Overwrite existing state" }],',
        "  async run() {},",
      ],
      ["globalThis.__runeLoadedModules ??= [];", 'globalThis.__runeLoadedModules.push("create");'],
    ),
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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "create", "--help"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("Usage: mycli project create <id> [options]");
  expect(captured.stdout).toContain("-f, --force <boolean>");
  expect(captured.stderr).toBe("");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
    "create",
  ]);
});

test("runManifestCommand reports plain object default exports instead of crashing", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "export default {",
      '  description: "plain",',
      "  async run() {",
      '    console.log("hi");',
      "  },",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": "export default {};",
  });

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "create"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe(
    "Command module must export a value created with defineCommand(). Got a plain object.\n",
  );
});

// ---------------------------------------------------------------------------
// Unknown commands & version output
// ---------------------------------------------------------------------------

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

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "cretae"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(1);
  expect(captured.stdout).toBe("");
  expect(captured.stderr).toContain("Unknown command: mycli project cretae");
  expect(captured.stderr).toContain("create");
  expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
});

test("runManifestCommand prints version when --version is passed with version set", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["--version"],
    cliName: "mycli",
    version: "1.2.3",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("mycli v1.2.3\n");
  expect(captured.stderr).toBe("");
});

test("runManifestCommand prints version when -V is passed with version set", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["-V"],
    cliName: "mycli",
    version: "1.2.3",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toBe("mycli v1.2.3\n");
  expect(captured.stderr).toBe("");
});

test("runManifestCommand ignores --version when version is not set", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["--version"],
    cliName: "mycli",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).toContain("mycli");
  expect(captured.stderr).toBe("");
});

test("runManifestCommand does not treat --version as version request when passed to a subcommand", async () => {
  const { manifest } = await createRuntimeFixture({
    "commands/project/create/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
    "commands/project/list/index.mjs": [
      "export default {",
      "  args: [],",
      "  options: [],",
      "  async run() {},",
      "};",
    ].join("\n"),
  });

  const captured = await captureRunManifestCommand({
    manifest,
    rawArgs: ["project", "--version"],
    cliName: "mycli",
    version: "1.2.3",
  });

  expect(captured.exitCode).toBe(0);
  expect(captured.stdout).not.toContain("v1.2.3");
  expect(captured.stderr).toBe("");
});

// ---------------------------------------------------------------------------
// JSON mode
// ---------------------------------------------------------------------------

async function createJsonFixture(commandBody: string): Promise<{
  readonly manifest: CommandManifest;
}> {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "rune-json-"));
  fixtureRootDirectories.add(rootDirectory);

  const commandDir = path.join(rootDirectory, "commands", "list");
  await mkdir(commandDir, { recursive: true });

  const moduleContents = [
    `import { defineCommand } from ${JSON.stringify(coreEntryPath)};`,
    "",
    "export default defineCommand({",
    commandBody,
    "});",
  ].join("\n");

  await writeFile(path.join(commandDir, "index.mjs"), moduleContents);

  const manifest: CommandManifest = {
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["list"],
        aliases: [],
      },
      {
        pathSegments: ["list"],
        kind: "command",
        sourceFilePath: path.join(commandDir, "index.mjs"),
        childNames: [],
        aliases: [],
        description: "List items",
      },
    ],
  };

  return { manifest };
}

describe("json mode", () => {
  test("runManifestCommand serializes return value as JSON when --json is passed", async () => {
    const { manifest } = await createJsonFixture(
      [
        "  json: true,",
        "  async run(ctx) {",
        '    ctx.output.info("human text");',
        "    return { items: [1, 2, 3] };",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toEqual({ items: [1, 2, 3] });
    // output.info should be suppressed in JSON mode
    expect(captured.stdout).not.toContain("human text");
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand does not activate JSON mode for commands without json: true", async () => {
    const { manifest } = await createJsonFixture(
      ["  async run(ctx) {", '    ctx.output.info("hello");', "  },"].join("\n"),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    // --json is not recognized, so it should cause a parse error
    expect(captured.exitCode).toBe(1);
  });

  test("runManifestCommand does not activate JSON mode when --json appears after --", async () => {
    const { manifest } = await createJsonFixture(
      [
        "  json: true,",
        '  args: [{ name: "extra", type: "string" }],',
        "  async run(ctx) {",
        '    ctx.output.info("visible");',
        "    return { ok: true };",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("visible");
    // Should not contain JSON output
    expect(captured.stdout).not.toContain('"ok"');
  });

  test("runManifestCommand emits JSON error payload when command throws in JSON mode", async () => {
    const { manifest } = await createJsonFixture(
      ["  json: true,", "  async run() {", '    throw new Error("something broke");', "  },"].join(
        "\n",
      ),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({ error: "something broke" });
    expect(captured.stderr).toContain("something broke");
  });

  test("runManifestCommand emits JSON error payload on parse error in JSON mode", async () => {
    const { manifest } = await createJsonFixture(
      [
        "  json: true,",
        '  options: [{ name: "count", type: "number", required: true }],',
        "  async run() {",
        "    return { ok: true };",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    const parsed = JSON.parse(captured.stdout);
    expect(parsed).toHaveProperty("error");
    expect(captured.stderr).not.toBe("");
  });

  test("runManifestCommand handles non-serializable return values in JSON mode", async () => {
    const { manifest } = await createJsonFixture(
      ["  json: true,", "  async run() {", "    return { value: BigInt(42) };", "  },"].join("\n"),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    const parsed = JSON.parse(captured.stdout);
    expect(parsed).toHaveProperty("error", "Failed to serialize command output");
    expect(captured.stderr).toContain("Failed to serialize command output");
  });

  test("runManifestCommand serializes null when json command returns undefined", async () => {
    const { manifest } = await createJsonFixture(
      ["  json: true,", "  async run() {", "    // returns undefined implicitly", "  },"].join(
        "\n",
      ),
    );

    const captured = await captureRunManifestCommand({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toBeNull();
  });
});
