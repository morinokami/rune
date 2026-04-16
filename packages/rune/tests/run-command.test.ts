import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { runRuneCli } from "../src/cli/rune-cli";
import { captureCommandResult, createTempFixtureManager, type FixtureFiles } from "./helpers";

const coreEntryPath = fileURLToPath(new URL("../../core/src/index.ts", import.meta.url));
const testFixtures = createTempFixtureManager();

interface CommandModuleSpec {
  readonly description?: string;
  readonly args?: string;
  readonly options?: string;
  readonly runSignature?: string;
  readonly runBodyLines?: readonly string[];
}

afterEach(async () => {
  await testFixtures.cleanup();
});

// Fixtures

function createCommandModule({
  description,
  args,
  options,
  runSignature = "async run()",
  runBodyLines = [],
}: CommandModuleSpec): string {
  const moduleLines = [`import { defineCommand } from ${JSON.stringify(coreEntryPath)};`, ""];

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

async function createRunProject(files: FixtureFiles): Promise<string> {
  const { fixtureDirectory } = await testFixtures.createFixture({
    files,
  });
  return fixtureDirectory;
}

async function createRunWorkspaceProject(files: FixtureFiles): Promise<{
  readonly workspaceRoot: string;
  readonly projectRoot: string;
}> {
  const { rootDirectory, fixtureDirectory } = await testFixtures.createFixture({
    fixturePath: "fixture",
    files,
  });

  return {
    workspaceRoot: rootDirectory,
    projectRoot: fixtureDirectory,
  };
}

// Helpers

async function captureRuneCliResult(argv: readonly string[], cwd?: string) {
  return captureCommandResult(() => runRuneCli({ argv, cwd }));
}

describe("run execution", () => {
  test("runRuneCli executes a simple command through `rune run`", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
        args: "[]",
        options: '[{ name: "name", type: "string", required: true }]',
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(`hello ${ctx.options.name}`);"],
      }),
    });

    const captured = await captureRuneCliResult(["run", "hello", "--name", "rune"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello rune\n");
    expect(captured.stderr).toBe("");

    const manifestContents = await readFile(
      path.join(projectRoot, ".rune", "manifest.json"),
      "utf8",
    );
    expect(manifestContents).toContain('"hello"');
  });

  test("runRuneCli shows help in run mode and refreshes the manifest after command edits", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
      }),
    });

    const firstResult = await captureRuneCliResult(["run"], projectRoot);

    expect(firstResult.exitCode).toBe(0);
    expect(firstResult.stdout).toContain("hello  Say hello");
    expect(firstResult.stderr).toBe("");

    await writeFile(
      path.join(projectRoot, "src", "commands", "hello", "index.ts"),
      createCommandModule({
        description: "Say hi",
      }),
    );

    const secondResult = await captureRuneCliResult(["run"], projectRoot);

    expect(secondResult.exitCode).toBe(0);
    expect(secondResult.stdout).toContain("hello  Say hi");
    expect(secondResult.stderr).toBe("");
  });
});

describe("top-level CLI behavior", () => {
  test("runRuneCli shows top-level help with no args", async () => {
    const captured = await captureRuneCliResult([]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune <command>\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli shows run help without loading a project", async () => {
    const captured = await captureRuneCliResult(["run", "--help"]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune run [options]\n");
    expect(captured.stdout).toContain("Run a Rune project directly from source");
    expect(captured.stderr).toBe("");
  });

  test("rune run --project <path> --help shows help", async () => {
    const captured = await captureRuneCliResult(["run", "--project", "./foo", "--help"]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune run [options]\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reports unknown top-level subcommands", async () => {
    const captured = await captureRuneCliResult(["unknown"]);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toContain("Unknown command: rune unknown\n");
  });

  test("rune build --project <path> --help shows help", async () => {
    const captured = await captureRuneCliResult(["build", "--project", "./foo", "--help"]);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: rune build");
    expect(captured.stderr).toBe("");
  });

  test("rune build foo --help reports an error instead of showing help", async () => {
    const captured = await captureRuneCliResult(["build", "foo", "--help"]);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toContain("Unexpected argument for rune build: foo");
  });
});

describe("run subcommand parsing", () => {
  test("runRuneCli only parses rune run options before the command path", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/create/index.ts": createCommandModule({
        args: "[]",
        options: '[{ name: "project", type: "string", required: true }]',
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(`create ${ctx.options.project}`);"],
      }),
    });

    const captured = await captureRuneCliResult(
      ["run", "create", "--project", "myapp"],
      projectRoot,
    );

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("create myapp\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli supports forwarding commands after `--` with an explicit project path", async () => {
    const { workspaceRoot } = await createRunWorkspaceProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
        args: "[]",
        options: "[]",
        runBodyLines: ['console.log("hello");'],
      }),
    });

    const captured = await captureRuneCliResult(
      ["run", "--project", "./fixture", "--", "hello"],
      workspaceRoot,
    );

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli preserves the caller cwd when using `--project` in run mode", async () => {
    const { workspaceRoot } = await createRunWorkspaceProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/show-cwd/index.ts": createCommandModule({
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(ctx.cwd);"],
      }),
    });

    const invocationRoot = path.join(workspaceRoot, "invocation");
    await mkdir(invocationRoot, { recursive: true });

    const captured = await captureRuneCliResult(
      ["run", "--project", "../fixture", "--", "show-cwd"],
      invocationRoot,
    );

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe(`${invocationRoot}\n`);
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli supports `--project=<path>` before the command path", async () => {
    const { workspaceRoot } = await createRunWorkspaceProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        args: "[]",
        options: "[]",
        runBodyLines: ['console.log("hello");'],
      }),
    });

    const captured = await captureRuneCliResult(
      ["run", "--project=./fixture", "hello"],
      workspaceRoot,
    );

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reports missing values for `rune run --project`", async () => {
    const captured = await captureRuneCliResult(["run", "--project"]);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe("Missing value for --project. Usage: --project <path>\n");
  });

  test("rune run hello --help passes --help through to the user command", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
        args: "[]",
        options: "[]",
        runBodyLines: ['console.log("hello");'],
      }),
    });

    const captured = await captureRuneCliResult(["run", "hello", "--help"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli hello");
    expect(captured.stdout).toContain("Say hello");
    expect(captured.stderr).toBe("");
  });
});

describe("CLI name resolution", () => {
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
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
      }),
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: runeplay <command>\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli falls back to the unscoped package name when no bin field exists", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "@scope/mycli" }, null, 2),
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
      }),
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli <command>\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli falls back to the project directory name when package.json is missing", async () => {
    const projectRoot = await createRunProject({
      "src/commands/hello/index.ts": createCommandModule({
        description: "Say hello",
      }),
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain(`Usage: ${path.basename(projectRoot)} <command>\n`);
    expect(captured.stderr).toBe("");
  });
});

describe("alternate command layouts and runtime errors", () => {
  test("runRuneCli executes a bare file command through `rune run`", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "src/commands/hello.ts": createCommandModule({
        description: "Say hello",
        options: '[{ name: "name", type: "string", required: true }]',
        runSignature: "async run(ctx)",
        runBodyLines: ["console.log(`hello ${ctx.options.name}`);"],
      }),
    });

    const captured = await captureRuneCliResult(["run", "hello", "--name", "rune"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello rune\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reports missing src/commands directories", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toContain("Commands directory not found at src/commands");
  });

  test("runRuneCli returns the project version before validating src/commands", async () => {
    const projectRoot = await createRunProject({
      "package.json": JSON.stringify({ name: "mycli", version: "1.2.3" }, null, 2),
    });

    const captured = await captureRuneCliResult(["run", "--version"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("mycli v1.2.3\n");
    expect(captured.stderr).toBe("");
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

    const captured = await captureRuneCliResult(["run", "plain"], projectRoot);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe(
      "Command module must export a value created with defineCommand(). Got a plain object.\n",
    );
  });
});
