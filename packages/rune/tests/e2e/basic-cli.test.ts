import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { createTempFixtureManager } from "../helpers";
import {
  captureBuiltCliResult,
  captureRuneCliProcessResult,
  ensureBuiltPackageEnvironment,
  installRuneFixturePackage,
  setupRuneCliTestEnvironment,
} from "../rune-cli-test-environment";

const e2eFixtures = createTempFixtureManager();
let projectRoot: string;

setupRuneCliTestEnvironment();

beforeAll(async () => {
  await ensureBuiltPackageEnvironment();
  projectRoot = await createBasicCliProject();
});

afterAll(async () => {
  await e2eFixtures.cleanup();
});

async function createBasicCliProject(): Promise<string> {
  const { fixtureDirectory: projectRoot } = await e2eFixtures.createFixture({
    files: {
      "package.json": JSON.stringify(
        {
          name: "e2e-cli",
          version: "1.2.3",
        },
        null,
        2,
      ),
      "rune.config.ts": `import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    if (data.kind === "group" && data.pathSegments.join("/") === "project") {
      return "Project help from config\\n";
    }

    return renderDefaultHelp(data);
  },
});
`,
      "src/commands/hello.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  options: [{ name: "name", type: "string", required: true }],
  async run(ctx) {
    ctx.output.log(\`hello \${ctx.options.name}\`);
  },
});
`,
      "src/commands/project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Project commands",
  examples: ["e2e-cli project create demo"],
});
`,
      "src/commands/project/create.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a project",
  args: [{ name: "id", type: "string", required: true }],
  options: [{ name: "force", type: "boolean", short: "f" }],
  async run(ctx) {
    ctx.output.log(\`create \${ctx.args.id} force=\${ctx.options.force}\`);
  },
});
`,
    },
  });

  await installRuneFixturePackage(projectRoot);
  return projectRoot;
}

describe("basic Rune CLI E2E", () => {
  test("runs the fixture project from source", async () => {
    const runResult = await captureRuneCliProcessResult(projectRoot, [
      "run",
      "hello",
      "--name",
      "Rune",
    ]);
    expect(runResult).toEqual({
      exitCode: 0,
      stdout: "hello Rune\n",
      stderr: "",
    });

    const runNestedResult = await captureRuneCliProcessResult(projectRoot, [
      "run",
      "project",
      "create",
      "demo",
      "--force",
    ]);
    expect(runNestedResult).toEqual({
      exitCode: 0,
      stdout: "create demo force=true\n",
      stderr: "",
    });

    const runHelpResult = await captureRuneCliProcessResult(projectRoot, [
      "run",
      "project",
      "--help",
    ]);
    expect(runHelpResult).toEqual({
      exitCode: 0,
      stdout: "Project help from config\n",
      stderr: "",
    });
  });

  test("builds and runs the fixture project from dist", async () => {
    const buildResult = await captureRuneCliProcessResult(projectRoot, ["build"]);
    expect(buildResult.exitCode).toBe(0);
    expect(buildResult.stdout).toContain("dist/cli.mjs");

    const builtRunResult = await captureBuiltCliResult(projectRoot, ["hello", "--name", "Rune"]);
    expect(builtRunResult).toEqual({
      exitCode: 0,
      stdout: "hello Rune\n",
      stderr: "",
    });

    const builtNestedResult = await captureBuiltCliResult(projectRoot, [
      "project",
      "create",
      "demo",
      "--force",
    ]);
    expect(builtNestedResult).toEqual({
      exitCode: 0,
      stdout: "create demo force=true\n",
      stderr: "",
    });

    const builtHelpResult = await captureBuiltCliResult(projectRoot, ["project", "--help"]);
    expect(builtHelpResult).toEqual({
      exitCode: 0,
      stdout: "Project help from config\n",
      stderr: "",
    });

    // Intentional typo to verify unknown-command suggestions in the built CLI.
    const builtUnknownResult = await captureBuiltCliResult(projectRoot, ["projcet"]);
    expect(builtUnknownResult.exitCode).toBe(1);
    expect(builtUnknownResult.stdout).toBe("");
    expect(builtUnknownResult.stderr).toContain("Unknown command: e2e-cli projcet");
    expect(builtUnknownResult.stderr).toContain("project");
  });
});
