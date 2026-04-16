import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { runManifestCommand } from "../src/manifest/runtime/run-manifest-command";
import {
  captureCommandResult,
  createTempFixtureManager,
  type FixtureFiles,
  writeFixtureFiles,
} from "./helpers";

const coreEntryPath = fileURLToPath(new URL("../../core/src/index.ts", import.meta.url));
const testFixtures = createTempFixtureManager();

interface RuntimeCommandModuleSpec {
  readonly description?: string;
  readonly args?: string;
  readonly options?: string;
  readonly runSignature?: string;
  readonly runBodyLines?: readonly string[];
  readonly preludeLines?: readonly string[];
}

// Fixtures

function createDefinedCommandModule({
  description,
  args,
  options,
  runSignature = "async run()",
  runBodyLines = [],
  preludeLines = [],
}: RuntimeCommandModuleSpec): string {
  const moduleLines = [`import { defineCommand } from ${JSON.stringify(coreEntryPath)};`, ""];

  if (preludeLines.length > 0) {
    moduleLines.push(...preludeLines, "");
  }

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

afterEach(async () => {
  await testFixtures.cleanup();
  delete (globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules;
});

// Runtime fixture construction

async function createRuntimeFixture(files: FixtureFiles): Promise<{
  readonly rootDirectory: string;
  readonly manifest: CommandManifest;
}> {
  const rootDirectory = await testFixtures.createRoot();
  // Each test gets unique module URLs so dynamic import caching does not leak between cases.

  await writeFixtureFiles(rootDirectory, files);

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

async function captureRunManifestCommandResult(options: Parameters<typeof runManifestCommand>[0]) {
  return captureCommandResult(() => runManifestCommand(options));
}

describe("routed execution", () => {
  test("runManifestCommand executes the matched leaf command through the router", async () => {
    const { manifest } = await createRuntimeFixture({
      "commands/project/create/index.mjs": createDefinedCommandModule({
        description: "Create a project",
        args: '[{ name: "id", type: "string", required: true }]',
        options: '[{ name: "name", type: "string", required: true }]',
        runSignature: "async run(ctx)",
        runBodyLines: [
          "console.log(`name=${ctx.options.name}`);",
          "console.log(`id=${ctx.args.id}`);",
          "console.log(`cwd=${ctx.cwd}`);",
          'console.log(`raw=${ctx.rawArgs.join(",")}`);',
        ],
        preludeLines: [
          "globalThis.__runeLoadedModules ??= [];",
          'globalThis.__runeLoadedModules.push("create");',
        ],
      }),
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

    const captured = await captureRunManifestCommandResult({
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
      "commands/project/create/index.mjs": createDefinedCommandModule({
        args: "[]",
        options: "[]",
        preludeLines: [
          "globalThis.__runeLoadedModules ??= [];",
          'globalThis.__runeLoadedModules.push("create");',
        ],
      }),
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

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli project <command>");
    expect(captured.stderr).toBe("");
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
  });
});

describe("help and parse failures", () => {
  test("runManifestCommand returns parse failures as non-zero stderr results", async () => {
    const { manifest } = await createRuntimeFixture({
      "commands/project/create/index.mjs": createDefinedCommandModule({
        description: "Create a project",
        args: "[]",
        options: '[{ name: "name", type: "string", required: true }]',
        runBodyLines: ['console.log("should not run");'],
        preludeLines: [
          "globalThis.__runeLoadedModules ??= [];",
          'globalThis.__runeLoadedModules.push("create");',
        ],
      }),
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

    const captured = await captureRunManifestCommandResult({
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
      "commands/project/create/index.mjs": createDefinedCommandModule({
        description: "Create a project",
        args: '[{ name: "id", type: "string", required: true, description: "Project identifier" }]',
        options:
          '[{ name: "force", type: "boolean", short: "f", description: "Overwrite existing state" }]',
        preludeLines: [
          "globalThis.__runeLoadedModules ??= [];",
          'globalThis.__runeLoadedModules.push("create");',
        ],
      }),
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

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--help"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli project create <id> [options]");
    expect(captured.stdout).toContain("-f, --force");
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

    const captured = await captureRunManifestCommandResult({
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
});

describe("unknown commands and version output", () => {
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

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "--version"],
      cliName: "mycli",
      version: "1.2.3",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).not.toContain("v1.2.3");
    expect(captured.stderr).toBe("");
  });
});

async function createJsonFixture(commandBody: string): Promise<{
  readonly manifest: CommandManifest;
}> {
  const rootDirectory = await testFixtures.createRoot();

  const commandDir = path.join(rootDirectory, "commands", "list");
  await mkdir(commandDir, { recursive: true });

  const moduleContents = [
    `import { CommandError, defineCommand } from ${JSON.stringify(coreEntryPath)};`,
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
        '    ctx.output.log("human text");',
        "    return { items: [1, 2, 3] };",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toEqual({ items: [1, 2, 3] });
    // output.log should be suppressed in JSON mode
    expect(captured.stdout).not.toContain("human text");
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand does not activate JSON mode for commands without json: true", async () => {
    const { manifest } = await createJsonFixture(
      ["  async run(ctx) {", '    ctx.output.log("hello");', "  },"].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
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
        '    ctx.output.log("visible");',
        "    return { ok: true };",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
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

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({
      error: {
        kind: "rune/unexpected",
        message: "something broke",
      },
    });
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand renders CommandError in human mode", async () => {
    const { manifest } = await createJsonFixture(
      [
        "  async run() {",
        "    throw new CommandError({",
        '      kind: "project/invalid-name",',
        '      message: "Project name must be lowercase kebab-case",',
        '      hint: "Try --name my-app",',
        "      exitCode: 9,",
        "    });",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(9);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe(
      "Project name must be lowercase kebab-case\nHint: Try --name my-app\n",
    );
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

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({
      error: {
        kind: "rune/invalid-arguments",
        message: "Missing required option:\n\n  --count <number>",
      },
    });
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand omits non-serializable CommandError details in JSON mode", async () => {
    const { manifest } = await createJsonFixture(
      [
        "  json: true,",
        "  async run() {",
        "    throw new CommandError({",
        '      kind: "config/not-found",',
        '      message: "Config file was not found",',
        "      details: BigInt(42),",
        "    });",
        "  },",
      ].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({
      error: {
        kind: "config/not-found",
        message: "Config file was not found",
      },
    });
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand handles non-serializable return values in JSON mode", async () => {
    const { manifest } = await createJsonFixture(
      ["  json: true,", "  async run() {", "    return { value: BigInt(42) };", "  },"].join("\n"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    const parsed = JSON.parse(captured.stdout);
    expect(parsed).toEqual({
      error: {
        kind: "rune/unexpected",
        message: "Failed to serialize command output",
      },
    });
    expect(captured.stderr).toContain("Failed to serialize command output");
  });

  test("runManifestCommand serializes null when json command returns undefined", async () => {
    const { manifest } = await createJsonFixture(
      ["  json: true,", "  async run() {", "    // returns undefined implicitly", "  },"].join(
        "\n",
      ),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toBeNull();
  });
});
