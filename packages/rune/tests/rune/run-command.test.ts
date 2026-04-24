import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

import { captureRuneCliResult, setupTempFixtures } from "./helpers";

const coreEntryPath = JSON.stringify(
  fileURLToPath(new URL("../../src/core/define-command.ts", import.meta.url)),
);
const defineConfigPath = JSON.stringify(
  fileURLToPath(new URL("../../src/core/define-config.ts", import.meta.url)),
);

const testFixtures = setupTempFixtures();

describe("run execution", () => {
  test("runRuneCli executes a simple command through `rune run`", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  args: [],
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    console.log(\`hello \${ctx.options.name}\`);
  },
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello", "--name", "rune"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello rune\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reflects command description changes across successive runs", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
      },
    });

    const firstResult = await captureRuneCliResult(["run"], projectRoot);

    expect(firstResult.exitCode).toBe(0);
    expect(firstResult.stdout).toContain("hello  Say hello");
    expect(firstResult.stderr).toBe("");

    await writeFile(
      path.join(projectRoot, "src", "commands", "hello", "index.ts"),
      `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hi",
  async run() {},
});
`,
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
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/create/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  args: [],
  options: [{ name: "project", type: "string", required: true }],
  async run(ctx) {
    console.log(\`create \${ctx.options.project}\`);
  },
});
`,
      },
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
    const { rootDirectory: workspaceRoot } = await testFixtures.createFixture({
      fixturePath: "fixture",
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  args: [],
  options: [],
  async run() {
    console.log("hello");
  },
});
`,
      },
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
    const { rootDirectory: workspaceRoot } = await testFixtures.createFixture({
      fixturePath: "fixture",
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/show-cwd/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  async run(ctx) {
    console.log(ctx.cwd);
  },
});
`,
      },
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
    const { rootDirectory: workspaceRoot } = await testFixtures.createFixture({
      fixturePath: "fixture",
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  args: [],
  options: [],
  async run() {
    console.log("hello");
  },
});
`,
      },
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
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  args: [],
  options: [],
  async run() {
    console.log("hello");
  },
});
`,
      },
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
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
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
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: runeplay <command>\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli falls back to the unscoped package name when no bin field exists", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "@scope/mycli" }, null, 2),
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli <command>\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli falls back to the project directory name when package.json is missing", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "src/commands/hello/index.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain(`Usage: ${path.basename(projectRoot)} <command>\n`);
    expect(captured.stderr).toBe("");
  });
});

describe("alternate command layouts and runtime errors", () => {
  test("runRuneCli executes a bare file command through `rune run`", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    console.log(\`hello \${ctx.options.name}\`);
  },
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello", "--name", "rune"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello rune\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli reports missing src/commands directories", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      },
    });

    const captured = await captureRuneCliResult(["run"], projectRoot);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toContain("Commands directory not found at src/commands");
  });

  test("runRuneCli returns the project version before validating src/commands", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", version: "1.2.3" }, null, 2),
      },
    });

    const captured = await captureRuneCliResult(["run", "--version"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("mycli v1.2.3\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli resolves extensionless relative imports in user commands", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", type: "module" }, null, 2),
        "tsconfig.json": JSON.stringify(
          {
            compilerOptions: {
              target: "esnext",
              module: "preserve",
              moduleResolution: "bundler",
              strict: true,
            },
            include: ["src"],
          },
          null,
          2,
        ),
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};
import { greet } from "./hello-greet";

export default defineCommand({
  async run({ output }) {
    output.log(greet("world"));
  },
});
`,
        "src/commands/hello-greet.ts": `export function greet(name: string): string {
  return \`hello \${name}\`;
}
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello world\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli resolves `.js`-suffixed relative imports that target `.ts` files", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", type: "module" }, null, 2),
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};
import { greet } from "./hello-greet.js";

export default defineCommand({
  async run({ output }) {
    output.log(greet("world"));
  },
});
`,
        "src/commands/hello-greet.ts": `export function greet(name: string): string {
  return \`hi \${name}\`;
}
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hi world\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli preserves source layout so `import.meta.url`-relative assets resolve", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", type: "module" }, null, 2),
        "src/data/message.txt": "hello from asset\n",
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export default defineCommand({
  async run({ output }) {
    const assetUrl = new URL("../data/message.txt", import.meta.url);
    const contents = await readFile(fileURLToPath(assetUrl), "utf8");
    output.log(contents.trimEnd());
  },
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello from asset\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli resolves third-party packages from node_modules without bundling them", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify(
          {
            name: "mycli",
            dependencies: {
              "cjs-pkg": "0.0.0",
            },
          },
          null,
          2,
        ),
        "node_modules/cjs-pkg/package.json": JSON.stringify(
          { name: "cjs-pkg", version: "0.0.0", main: "index.js" },
          null,
          2,
        ),
        "node_modules/cjs-pkg/index.js": `module.exports = { greet(name) { return "hello " + name; } };\n`,
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};
import pkg from "cjs-pkg";

export default defineCommand({
  async run({ output }) {
    output.log(pkg.greet("rune"));
  },
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toBe("hello rune\n");
    expect(captured.stderr).toBe("");
  });

  test("runRuneCli bundles rune.config.ts only when help is rendered", async () => {
    // Config with an extensionless relative import would fail under native
    // type-stripping. The Rolldown-bundled help path should resolve it, while
    // the direct execution path should not even load the config.
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", type: "module" }, null, 2),
        "rune.config.ts": `import { defineConfig } from ${defineConfigPath};
import { renderer } from "./config-support/renderer";

export default defineConfig({ help: renderer });
`,
        "config-support/renderer.ts": `export function renderer(data: { kind: string; pathSegments?: readonly string[] }): string {
  const segments = data.pathSegments?.join(" ") ?? "<root>";
  return \`CUSTOM HELP for \${segments}\\n\`;
}
`,
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run({ output }) {
    output.log("hello");
  },
});
`,
      },
    });

    const helpResult = await captureRuneCliResult(["run", "hello", "--help"], projectRoot);

    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.stdout).toContain("CUSTOM HELP for hello");
    expect(helpResult.stderr).toBe("");

    const runResult = await captureRuneCliResult(["run", "hello"], projectRoot);

    expect(runResult.exitCode).toBe(0);
    expect(runResult.stdout).toBe("hello\n");
    expect(runResult.stderr).toBe("");
  });

  test("runRuneCli falls back to default help when rune.config.ts fails to build", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli", type: "module" }, null, 2),
        "rune.config.ts": `import { defineConfig } from ${defineConfigPath};
import { renderer } from "./does-not-exist";

export default defineConfig({ help: renderer });
`,
        "src/commands/hello.ts": `import { defineCommand } from ${coreEntryPath};

export default defineCommand({
  description: "Say hello",
  async run({ output }) {
    output.log("hello");
  },
});
`,
      },
    });

    const captured = await captureRuneCliResult(["run", "hello", "--help"], projectRoot);

    expect(captured.exitCode).toBe(0);
    expect(captured.stdout).toContain("Usage: mycli hello");
    expect(captured.stderr).toContain("Warning: Failed to load rune.config.ts.");
  });

  test("runRuneCli reports plain object default exports with a clear error", async () => {
    const { fixtureDirectory: projectRoot } = await testFixtures.createFixture({
      files: {
        "package.json": JSON.stringify({ name: "mycli" }, null, 2),
        "src/commands/plain/index.ts": [
          "export default {",
          '  description: "plain",',
          "  async run() {",
          '    console.log("hi");',
          "  },",
          "};",
        ].join("\n"),
      },
    });

    const captured = await captureRuneCliResult(["run", "plain"], projectRoot);

    expect(captured.exitCode).toBe(1);
    expect(captured.stdout).toBe("");
    expect(captured.stderr).toBe(
      "Command module must export a value created with defineCommand(). Got a plain object.\n",
    );
  });
});
