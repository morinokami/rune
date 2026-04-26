import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import { captureRuneCliResult, pathExists, setupTempFixtures } from "../helpers";
import {
  captureBuiltCliResult,
  ensureBuiltPackageEnvironment,
  installRuneFixturePackage,
  setupRuneCliTestEnvironment,
} from "../rune-cli-test-environment";

const buildProjectFixtures = setupTempFixtures();

setupRuneCliTestEnvironment();

beforeAll(async () => {
  await ensureBuiltPackageEnvironment();
});

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
    expect(commandHelpResult.stdout).toContain("Say hello\n\nUsage: mycli hello");
    expect(commandHelpResult.stdout).not.toContain("Description:");
  });

  test("the built CLI uses defineConfig name and version", async () => {
    const { projectRoot } = await createBuildProject({
      "rune.config.ts": `import { defineConfig } from "@rune-cli/rune";

export default defineConfig({ name: "config-cli", version: "2.0.0" });
`,
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

    const versionResult = await captureBuiltCliResult(projectRoot, ["--version"]);
    expect(versionResult).toEqual({
      exitCode: 0,
      stdout: "config-cli v2.0.0\n",
      stderr: "",
    });

    const helpResult = await captureBuiltCliResult(projectRoot, []);
    expect(helpResult.exitCode).toBe(0);
    expect(helpResult.stdout).toContain("Usage: config-cli <command>\n");
    expect(helpResult.stdout).toContain("-V, --version");
    expect(helpResult.stderr).toBe("");
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

  test("runRuneCli build leaves third-party package imports external", async () => {
    const { projectRoot } = await createBuildProject({
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
      "node_modules/cjs-pkg/index.js": [
        "'use strict';",
        "module.exports = {",
        "  describe: function describe(name) {",
        "    return 'hello ' + name;",
        "  },",
        "};",
        "",
      ].join("\n"),
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";
import pkg from "cjs-pkg";

export default defineCommand({
  description: "Uses an external dependency",
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    ctx.output.log(pkg.describe(ctx.options.name));
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const builtCommandSource = await readFile(
      path.join(projectRoot, "dist", "commands", "hello.mjs"),
      "utf8",
    );
    expect(builtCommandSource).toContain(`from "cjs-pkg"`);

    const result = await captureBuiltCliResult(projectRoot, ["hello", "--name", "rune"]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
  });

  test("runRuneCli build warns when runtime dependencies are only in devDependencies", async () => {
    const { projectRoot } = await createBuildProject({
      "package.json": JSON.stringify(
        {
          name: "mycli",
          devDependencies: {
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
      "node_modules/cjs-pkg/index.js": `module.exports = { value: "ok" };\n`,
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";
import pkg from "cjs-pkg";

export default defineCommand({
  description: "Uses a misplaced dependency",
  async run(ctx) {
    ctx.output.log(pkg.value);
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toContain(
      'Warning: Runtime dependency "cjs-pkg" is listed in devDependencies.',
    );
  });

  test("runRuneCli build does not warn for type-only imports from devDependencies", async () => {
    const { projectRoot } = await createBuildProject({
      "package.json": JSON.stringify(
        {
          name: "mycli",
          devDependencies: {
            "types-only-pkg": "0.0.0",
          },
        },
        null,
        2,
      ),
      "node_modules/types-only-pkg/package.json": JSON.stringify(
        { name: "types-only-pkg", version: "0.0.0", types: "index.d.ts" },
        null,
        2,
      ),
      "node_modules/types-only-pkg/index.d.ts": `export interface Payload { readonly message: string; }\n`,
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";
import type { Payload } from "types-only-pkg";

export default defineCommand({
  description: "Uses a type-only dependency",
  async run(ctx) {
    const payload: Payload = { message: "hello" };
    ctx.output.log(payload.message);
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const result = await captureBuiltCliResult(projectRoot, ["hello"]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: "hello\n",
      stderr: "",
    });
  });

  test("runRuneCli build does not warn for tsconfig path aliases that resolve locally", async () => {
    const { projectRoot } = await createBuildProject({
      "package.json": JSON.stringify({ name: "mycli" }, null, 2),
      "tsconfig.json": JSON.stringify(
        {
          compilerOptions: {
            baseUrl: ".",
            paths: {
              "@utils": ["./src/utils.ts"],
            },
          },
        },
        null,
        2,
      ),
      "src/utils.ts": `export function greet(name: string): string {
  return \`hello \${name}\`;
}
`,
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";
import { greet } from "@utils";

export default defineCommand({
  description: "Uses a tsconfig alias",
  async run(ctx) {
    ctx.output.log(greet("rune"));
  },
});
`,
    });

    const buildResult = await captureRuneCliResult(["build"], projectRoot);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stderr).toBe("");

    const result = await captureBuiltCliResult(projectRoot, ["hello"]);
    expect(result).toEqual({
      exitCode: 0,
      stdout: "hello rune\n",
      stderr: "",
    });
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
  options: [],
  args: [],
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
