import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../../src/manifest/manifest-types";

import { HELP_JSON_SCHEMA_VERSION } from "../../src/help/help-json";
import { runManifestCommand } from "../../src/runtime/run-manifest-command";
import {
  captureCommandResult,
  commandNode,
  groupNode,
  setupTempFixtures,
  writeFixtureFiles,
} from "../helpers";

const coreEntryPath = JSON.stringify(
  fileURLToPath(new URL("../../src/core/define-command.ts", import.meta.url)),
);
const commandErrorPath = JSON.stringify(
  fileURLToPath(new URL("../../src/core/command-error.ts", import.meta.url)),
);
const testFixtures = setupTempFixtures();

afterEach(() => {
  delete (globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules;
});

const stubModule = `export default { options: [], args: [], async run() {} };`;

const trackedStubModule = (name: string) => `globalThis.__runeLoadedModules ??= [];
globalThis.__runeLoadedModules.push("${name}");
export default {
  options: [],
  args: [],
  async run() {},
};
`;

// Runtime fixture construction

async function createRuntimeFixture(
  createModule: string,
  listModule: string,
): Promise<{
  readonly rootDirectory: string;
  readonly manifest: CommandManifest;
}> {
  const rootDirectory = await testFixtures.createRoot();
  // Each test gets unique module URLs so dynamic import caching does not leak between cases.

  await writeFixtureFiles(rootDirectory, {
    "commands/project/create/index.mjs": createModule,
    "commands/project/list/index.mjs": listModule,
  });

  const manifest: CommandManifest = {
    nodes: [
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({ pathSegments: ["project"], childNames: ["create", "list"] }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: path.join(rootDirectory, "commands", "project", "create", "index.mjs"),
        description: "Create a project",
      }),
      commandNode({
        pathSegments: ["project", "list"],
        sourceFilePath: path.join(rootDirectory, "commands", "project", "list", "index.mjs"),
        description: "List projects",
      }),
    ],
  };

  return { rootDirectory, manifest };
}

async function captureRunManifestCommandResult(options: Parameters<typeof runManifestCommand>[0]) {
  return captureCommandResult(() => runManifestCommand(options));
}

describe("routed execution", () => {
  test("runManifestCommand executes the matched leaf command through the router", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Create a project",
  options: [{ name: "name", type: "string", required: true }],
  args: [{ name: "id", type: "string", required: true }],
  async run(ctx) {
    console.log(\`name=\${ctx.options.name}\`);
    console.log(\`id=\${ctx.args.id}\`);
    console.log(\`cwd=\${ctx.cwd}\`);
    console.log(\`raw=\${ctx.rawArgs.join(",")}\`);
  },
});
`,
      trackedStubModule("list"),
    );

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
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

globalThis.__runeLoadedModules ??= [];
globalThis.__runeLoadedModules.push("create");

export default defineCommand({
  options: [],
  args: [],
  async run() {},
});
`,
      trackedStubModule("list"),
    );

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
});

describe("group help", () => {
  test("runManifestCommand returns help output without loading child commands for groups", async () => {
    const { manifest } = await createRuntimeFixture(
      trackedStubModule("create"),
      trackedStubModule("list"),
    );

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

describe("leaf help", () => {
  test("runManifestCommand returns leaf help through the routed command path", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

globalThis.__runeLoadedModules ??= [];
globalThis.__runeLoadedModules.push("create");

export default defineCommand({
  description: "Create a project",
  options: [{ name: "force", type: "boolean", short: "f", description: "Overwrite existing state" }],
  args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
  async run() {},
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--help"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli project create [options] <id>");
    expect(captured.stdout).toContain("-f, --force");
    expect(captured.stderr).toBe("");
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
      "create",
    ]);
  });
});

describe("help json mode", () => {
  test("runManifestCommand emits command help data as JSON when --help --json is passed", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

globalThis.__runeLoadedModules ??= [];
globalThis.__runeLoadedModules.push("create");

export default defineCommand({
  description: "Create a project",
  options: [
    { name: "color", type: "boolean", default: true, description: "Colorize output" },
    { name: "force", type: "boolean", short: "f", description: "Overwrite existing state" },
    { name: "tag", type: "string", multiple: true, description: "Filter tag" },
    { name: "target", type: "enum", values: ["dev", "prod"], default: "dev" },
  ],
  args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
  help() {
    return "custom help should not be used for JSON help";
  },
  async run() {},
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--help", "--json"],
      cliName: "mycli",
      version: "1.2.3",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stderr).toBe("");
    expect(JSON.parse(captured.stdout)).toEqual({
      schemaVersion: HELP_JSON_SCHEMA_VERSION,
      kind: "command",
      cli: { name: "mycli", version: "1.2.3" },
      command: {
        path: ["project", "create"],
        name: "create",
        description: "Create a project",
        aliases: [],
        examples: [],
      },
      args: [
        {
          name: "id",
          type: "string",
          description: "Project identifier",
          required: true,
        },
      ],
      options: [
        {
          name: "color",
          type: "boolean",
          source: "user",
          description: "Colorize output",
          default: true,
          required: false,
          multiple: false,
          negatable: true,
        },
        {
          name: "force",
          short: "f",
          type: "boolean",
          source: "user",
          description: "Overwrite existing state",
          required: false,
          multiple: false,
          negatable: false,
        },
        {
          name: "tag",
          type: "string",
          source: "user",
          description: "Filter tag",
          required: false,
          multiple: true,
          negatable: false,
        },
        {
          name: "target",
          type: "enum",
          source: "user",
          values: ["dev", "prod"],
          default: "dev",
          required: false,
          multiple: false,
          negatable: false,
        },
        {
          name: "help",
          short: "h",
          source: "framework",
          type: "boolean",
          description: "Show help",
          required: false,
          multiple: false,
          negatable: false,
        },
      ],
      commands: [],
    });
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
      "create",
    ]);
  });

  test("runManifestCommand includes runtime JSON output support as a framework option in JSON help", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Create a project",
  json: true,
  async run() {
    return { ok: true };
  },
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--help", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toMatchObject({
      kind: "command",
      options: [
        {
          name: "json",
          source: "framework",
          type: "boolean",
          description: "Output structured results as JSON",
          required: false,
          multiple: false,
          negatable: false,
        },
        {
          name: "help",
          source: "framework",
          type: "boolean",
          description: "Show help",
          required: false,
          multiple: false,
          negatable: false,
        },
      ],
    });
  });

  test("runManifestCommand accepts --json before --help for JSON help", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--json", "--help"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toMatchObject({
      schemaVersion: HELP_JSON_SCHEMA_VERSION,
      kind: "command",
      command: {
        path: ["project", "create"],
        name: "create",
      },
    });
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand emits group help data as JSON without loading child commands", async () => {
    const { manifest } = await createRuntimeFixture(
      trackedStubModule("create"),
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "--help", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toEqual({
      schemaVersion: HELP_JSON_SCHEMA_VERSION,
      kind: "group",
      cli: { name: "mycli" },
      command: {
        path: ["project"],
        name: "project",
        aliases: [],
        examples: [],
      },
      commands: [
        {
          name: "create",
          path: ["project", "create"],
          aliases: [],
          description: "Create a project",
        },
        {
          name: "list",
          path: ["project", "list"],
          aliases: [],
          description: "List projects",
        },
      ],
      options: [
        {
          name: "help",
          short: "h",
          source: "framework",
          type: "boolean",
          description: "Show help",
          required: false,
          multiple: false,
          negatable: false,
        },
      ],
    });
    expect(captured.stderr).toBe("");
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
  });

  test("runManifestCommand omits command name for root JSON help", async () => {
    const { manifest } = await createRuntimeFixture(
      trackedStubModule("create"),
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["--help", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toMatchObject({
      kind: "group",
      command: {
        path: [],
        aliases: [],
        examples: [],
      },
    });
    expect(JSON.parse(captured.stdout).command).not.toHaveProperty("name");
  });

  test("runManifestCommand emits unknown command help data as JSON with a non-zero exit", async () => {
    const { manifest } = await createRuntimeFixture(
      trackedStubModule("create"),
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "cretae", "--help", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({
      schemaVersion: HELP_JSON_SCHEMA_VERSION,
      kind: "unknown",
      cli: { name: "mycli" },
      attemptedPath: ["project", "cretae"],
      matchedPath: ["project"],
      unknownSegment: "cretae",
      availableCommands: [
        {
          name: "create",
          path: ["project", "create"],
          aliases: [],
          description: "Create a project",
        },
        {
          name: "list",
          path: ["project", "list"],
          aliases: [],
          description: "List projects",
        },
      ],
      suggestions: [
        {
          name: "create",
          path: ["project", "create"],
          aliases: [],
          description: "Create a project",
        },
      ],
    });
    expect(captured.stderr).toBe("");
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toBeUndefined();
  });

  test("runManifestCommand does not treat --json after -- as JSON help", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--help", "--", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli project create");
    expect(() => JSON.parse(captured.stdout)).toThrow();
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand treats --help and --json after -- as positional args (triggering unexpected-argument error)", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Create a project",
  args: [{ name: "value", type: "string", required: true }],
  async run(ctx) {
    ctx.output.log(ctx.args.value);
  },
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create", "--", "--help", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe('Unexpected argument "--json"\n');
  });
});

describe("json mode", () => {
  // JSON-mode activation rules (--json extraction, -- terminator, simulateAgent,
  // json:true gating) are covered by run-command-pipeline tests. These tests
  // focus on manifest-layer concerns: JSON error envelope, serialization
  // fallbacks, and null coercion.

  test("runManifestCommand emits JSON error payload when command throws in JSON mode", async () => {
    const { manifest } = await createJsonFixture(`  json: true,
  async run() {
    throw new Error("something broke");
  },`);

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

  test("runManifestCommand emits JSON error payload on parse error in JSON mode", async () => {
    const { manifest } = await createJsonFixture(`  json: true,
  options: [{ name: "count", type: "number", required: true }],
  async run() {
    return { ok: true };
  },`);

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(JSON.parse(captured.stdout)).toEqual({
      error: {
        kind: "rune/invalid-arguments",
        message: "Missing required option:\n  --count <number>",
      },
    });
    expect(captured.stderr).toBe("");
  });

  test("runManifestCommand omits non-serializable CommandError details in JSON mode", async () => {
    const { manifest } = await createJsonFixture(`  json: true,
  async run() {
    throw new CommandError({
      kind: "config/not-found",
      message: "Config file was not found",
      details: BigInt(42),
    });
  },`);

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
    const { manifest } = await createJsonFixture(`  json: true,
  async run() {
    return { value: BigInt(42) };
  },`);

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
    const { manifest } = await createJsonFixture(`  json: true,
  async run() {
    // returns undefined implicitly
  },`);

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["list", "--json"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(0);
    expect(JSON.parse(captured.stdout)).toBeNull();
  });
});

describe("parse failures", () => {
  test("runManifestCommand returns parse failures as non-zero stderr results", async () => {
    const { manifest } = await createRuntimeFixture(
      `import { defineCommand } from ${coreEntryPath};

globalThis.__runeLoadedModules ??= [];
globalThis.__runeLoadedModules.push("create");

export default defineCommand({
  description: "Create a project",
  options: [{ name: "name", type: "string", required: true }],
  args: [],
  async run() {
    console.log("should not run");
  },
});
`,
      trackedStubModule("list"),
    );

    const captured = await captureRunManifestCommandResult({
      manifest,
      rawArgs: ["project", "create"],
      cliName: "mycli",
    });

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe("Missing required option:\n  --name <string>\n");
    expect((globalThis as { __runeLoadedModules?: string[] }).__runeLoadedModules).toEqual([
      "create",
    ]);
  });
});

describe("error rendering (human)", () => {
  test("runManifestCommand renders CommandError in human mode", async () => {
    const { manifest } = await createJsonFixture(`  async run() {
    throw new CommandError({
      kind: "project/invalid-name",
      message: "Project name must be lowercase kebab-case",
      hint: "Try --name my-app",
      exitCode: 9,
    });
  },`);

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
});

describe("module load errors", () => {
  test("runManifestCommand reports plain object default exports instead of crashing", async () => {
    const { manifest } = await createRuntimeFixture(
      `export default {
  description: "plain",
  async run() {
    console.log("hi");
  },
};
`,
      "export default {};",
    );

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

describe("unknown commands", () => {
  test("runManifestCommand returns unknown command failures with suggestions", async () => {
    const { manifest } = await createRuntimeFixture(
      trackedStubModule("create"),
      trackedStubModule("list"),
    );

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
});

describe("version output", () => {
  test("runManifestCommand prints version when --version is passed with version set", async () => {
    const { manifest } = await createRuntimeFixture(stubModule, stubModule);

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
    const { manifest } = await createRuntimeFixture(stubModule, stubModule);

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
    const { manifest } = await createRuntimeFixture(stubModule, stubModule);

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
    const { manifest } = await createRuntimeFixture(stubModule, stubModule);

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
  const sourceFilePath = path.join(rootDirectory, "commands", "list", "index.mjs");

  await writeFixtureFiles(rootDirectory, {
    "commands/list/index.mjs": `import { defineCommand } from ${coreEntryPath};
import { CommandError } from ${commandErrorPath};

export default defineCommand({
${commandBody}
});
`,
  });

  const manifest: CommandManifest = {
    nodes: [
      groupNode({ pathSegments: [], childNames: ["list"] }),
      commandNode({
        pathSegments: ["list"],
        sourceFilePath,
        description: "List items",
      }),
    ],
  };

  return { manifest };
}
