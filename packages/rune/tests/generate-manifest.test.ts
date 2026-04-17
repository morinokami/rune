import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../src/manifest/generate/generate-manifest";
import { createTempFixtureManager, type FixtureFiles } from "./helpers";

const testFixtures = createTempFixtureManager();

afterEach(async () => {
  await testFixtures.cleanup();
});

async function createCommandsFixture(files: FixtureFiles): Promise<string> {
  const { fixtureDirectory } = await testFixtures.createFixture({
    fixturePath: path.join("src", "commands"),
    files,
  });
  return fixtureDirectory;
}

describe("manifest structure", () => {
  test("generateCommandManifest discovers nested commands and groups deterministically", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello/index.ts": "export default {};",
      "project/index.ts": "export default {};",
      "project/create/index.ts": "export default {};",
      "project/list/index.ts": "export default {};",
      "user/delete/index.ts": "export default {};",
    });

    const descriptions: Record<string, string> = {
      "hello/index.ts": "Say hello",
      "project/index.ts": "Project commands",
      "project/create/index.ts": "Create a project",
      "project/list/index.ts": "List projects",
      "user/delete/index.ts": "Delete a user",
    };

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata(sourceFilePath) {
        const relativePath = path.relative(commandsDirectory, sourceFilePath);
        return { description: descriptions[relativePath], aliases: [], examples: [] };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          aliases: [],
          childNames: ["hello", "project", "user"],
        },
        {
          pathSegments: ["hello"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
          aliases: [],
          childNames: [],
          description: "Say hello",
        },
        {
          pathSegments: ["project"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
          aliases: [],
          childNames: ["create", "list"],
          description: "Project commands",
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
          aliases: [],
          childNames: [],
          description: "Create a project",
        },
        {
          pathSegments: ["project", "list"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "list", "index.ts"),
          aliases: [],
          childNames: [],
          description: "List projects",
        },
        {
          pathSegments: ["user"],
          kind: "group",
          aliases: [],
          childNames: ["delete"],
        },
        {
          pathSegments: ["user", "delete"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "user", "delete", "index.ts"),
          aliases: [],
          childNames: [],
          description: "Delete a user",
        },
      ],
    });
  });

  test("generateCommandManifest supports a root command at `src/commands/index.ts`", async () => {
    const commandsDirectory = await createCommandsFixture({
      "index.ts": "export default {};",
      "hello/index.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata(sourceFilePath) {
        const relativePath = path.relative(commandsDirectory, sourceFilePath);
        return {
          description: relativePath === "index.ts" ? "Create a project" : "Say hello",
          aliases: [],
          examples: [],
        };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "index.ts"),
          aliases: [],
          childNames: ["hello"],
          description: "Create a project",
        },
        {
          pathSegments: ["hello"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
          aliases: [],
          childNames: [],
          description: "Say hello",
        },
      ],
    });
  });

  test("generateCommandManifest skips empty directories", async () => {
    const commandsDirectory = await createCommandsFixture({
      "admin/users/index.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          aliases: [],
          childNames: ["admin"],
        },
        {
          pathSegments: ["admin"],
          kind: "group",
          aliases: [],
          childNames: ["users"],
        },
        {
          pathSegments: ["admin", "users"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "admin", "users", "index.ts"),
          aliases: [],
          childNames: [],
          description: undefined,
        },
      ],
    });
  });

  test("generateCommandManifest throws a descriptive error for an empty commands directory", async () => {
    const commandsDirectory = await createCommandsFixture({});

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "No commands found in src/commands/. Create a command file like src/commands/hello.ts or src/commands/hello/index.ts",
    );
  });
});

describe("description extraction", () => {
  test("generateCommandManifest extracts literal descriptions from source files by default", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        aliases: [],
        childNames: [],
        description: "Say hello",
      },
    ]);
  });
});

describe("bare command files", () => {
  test("generateCommandManifest discovers bare .ts command files", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "greet.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          aliases: [],
          childNames: ["greet", "hello"],
        },
        {
          pathSegments: ["greet"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "greet.ts"),
          aliases: [],
          childNames: [],
          description: undefined,
        },
        {
          pathSegments: ["hello"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "hello.ts"),
          aliases: [],
          childNames: [],
          description: undefined,
        },
      ],
    });
  });

  test("generateCommandManifest mixes bare files and directory commands", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "project/index.ts": "export default {};",
      "project/create/index.ts": "export default {};",
    });

    const descriptions: Record<string, string> = {
      "hello.ts": "Say hello",
      "project/index.ts": "Project commands",
      "project/create/index.ts": "Create a project",
    };

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata(sourceFilePath) {
        const relativePath = path.relative(commandsDirectory, sourceFilePath);
        return { description: descriptions[relativePath], aliases: [], examples: [] };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          aliases: [],
          childNames: ["hello", "project"],
        },
        {
          pathSegments: ["hello"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "hello.ts"),
          aliases: [],
          childNames: [],
          description: "Say hello",
        },
        {
          pathSegments: ["project"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
          aliases: [],
          childNames: ["create"],
          description: "Project commands",
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
          aliases: [],
          childNames: [],
          description: "Create a project",
        },
      ],
    });
  });

  test("generateCommandManifest supports bare files in nested directories", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/create.ts": "export default {};",
      "project/list.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest).toEqual({
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          aliases: [],
          childNames: ["project"],
        },
        {
          pathSegments: ["project"],
          kind: "group",
          aliases: [],
          childNames: ["create", "list"],
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
          aliases: [],
          childNames: [],
          description: undefined,
        },
        {
          pathSegments: ["project", "list"],
          kind: "command",
          sourceFilePath: path.join(commandsDirectory, "project", "list.ts"),
          aliases: [],
          childNames: [],
          description: undefined,
        },
      ],
    });
  });

  test("generateCommandManifest throws when bare file conflicts with command directory", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "hello/index.ts": "export default {};",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      'Conflicting command definitions: both "hello.ts" and "hello/" exist.',
    );
  });

  test("generateCommandManifest ignores empty same-name directory next to a bare file", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "hello/.gitkeep": "",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        aliases: [],
        childNames: [],
        description: undefined,
      },
    ]);
  });

  test("generateCommandManifest ignores .d.ts declaration files", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "types.d.ts": "export interface Message { readonly text: string; }",
      "utils.d.mts": "export declare function helper(): void;",
      "constants.d.cts": "export declare const VALUE: string;",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        aliases: [],
        childNames: [],
        description: undefined,
      },
    ]);
  });

  test("generateCommandManifest extracts descriptions from bare command files", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        aliases: [],
        childNames: [],
        description: "Say hello",
      },
    ]);
  });
});

describe("group metadata", () => {
  test("generateCommandManifest extracts group description from _group.ts with defineGroup", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
`,
      "project/create.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["project"],
      },
      {
        pathSegments: ["project"],
        kind: "group",
        aliases: [],
        childNames: ["create"],
        description: "Manage projects",
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
        aliases: [],
        childNames: [],
        description: "Create a project",
      },
    ]);
  });

  test("generateCommandManifest extracts root group description from _group.ts", async () => {
    const commandsDirectory = await createCommandsFixture({
      "_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "My awesome CLI",
});
`,
      "hello.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
        description: "My awesome CLI",
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        aliases: [],
        childNames: [],
        description: "Say hello",
      },
    ]);
  });

  test("generateCommandManifest extracts group description from variable export", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

const group = defineGroup({
  description: "Manage projects",
});

export default group;
`,
      "project/create.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const projectNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "project",
    );

    expect(projectNode).toEqual({
      pathSegments: ["project"],
      kind: "group",
      aliases: [],
      childNames: ["create"],
      description: "Manage projects",
    });
  });

  test("generateCommandManifest throws when _group.ts and index.ts coexist", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";
export default defineGroup({ description: "Manage projects" });`,
      "project/index.ts": "export default {};",
      "project/create.ts": "export default {};",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      'Conflicting definitions: both "_group.ts" and "index.ts" exist in the same directory.',
    );
  });

  test("generateCommandManifest throws when _group.ts exists in directory with no subcommands", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";
export default defineGroup({ description: "Manage projects" });`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "_group.ts exists but the directory has no subcommands",
    );
  });

  test("generateCommandManifest throws when _group.ts uses defineCommand instead of defineGroup", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineCommand } from "@rune-cli/rune";
export default defineCommand({
  description: "Wrong",
  async run() {},
});`,
      "project/create.ts": "export default {};",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      '_group.ts must use "export default defineGroup(...)"',
    );
  });

  test("generateCommandManifest throws when _group.ts has no default export", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": 'export const description = "Manage projects";',
      "project/create.ts": "export default {};",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "_group.ts must have a default export using defineGroup()",
    );
  });

  test("generateCommandManifest throws when _group.ts has an empty description", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";
export default defineGroup({ description: "" });`,
      "project/create.ts": "export default {};",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      '_group.ts must export a defineGroup() call with a non-empty "description" string.',
    );
  });

  test("generateCommandManifest does not treat _group.ts as a bare command", async () => {
    const commandsDirectory = await createCommandsFixture({
      "_group.ts": `import { defineGroup } from "@rune-cli/rune";
export default defineGroup({ description: "Root" });`,
      "hello.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata(sourceFilePath) {
        if (sourceFilePath.endsWith("_group.ts")) {
          return { description: "Root", aliases: [], examples: [] };
        }

        return undefined;
      },
    });

    const commandNames = manifest.nodes
      .filter((n) => n.kind === "command")
      .map((n) => n.pathSegments[0]);

    expect(commandNames).toEqual(["hello"]);
    expect(commandNames).not.toContain("_group");
  });
});

describe("description extraction from exported variables", () => {
  test("generateCommandManifest extracts descriptions from exported command variables", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello/index.ts": `import { defineCommand } from "@rune-cli/rune";

const command = defineCommand({
  description: "Say hello",
  async run() {},
});

export default command;
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      {
        pathSegments: [],
        kind: "group",
        aliases: [],
        childNames: ["hello"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        aliases: [],
        childNames: [],
        description: "Say hello",
      },
    ]);
  });
});

describe("alias extraction", () => {
  test("generateCommandManifest extracts inline aliases from defineCommand", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy the app",
  aliases: ["d", "dep"],
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const deployNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "deploy",
    );

    expect(deployNode?.aliases).toEqual(["d", "dep"]);
  });

  test("generateCommandManifest extracts aliases from variable references", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

const aliases = ["d"];

export default defineCommand({
  description: "Deploy the app",
  aliases: aliases,
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const deployNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "deploy",
    );

    expect(deployNode?.aliases).toEqual(["d"]);
  });

  test("generateCommandManifest extracts aliases from shorthand properties", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

const aliases = ["d"];

export default defineCommand({
  description: "Deploy the app",
  aliases,
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const deployNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "deploy",
    );

    expect(deployNode?.aliases).toEqual(["d"]);
  });

  test("generateCommandManifest extracts description from variable references", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": `import { defineCommand } from "@rune-cli/rune";

const description = "Say hello";

export default defineCommand({
  description,
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const helloNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "hello",
    );

    expect(helloNode?.description).toBe("Say hello");
  });

  test("generateCommandManifest extracts group aliases from _group.ts", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
  aliases: ["p"],
});
`,
      "project/create.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const projectNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "project",
    );

    expect(projectNode?.aliases).toEqual(["p"]);
  });
});

describe("alias validation", () => {
  test("generateCommandManifest throws when sibling aliases conflict", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy the app",
  aliases: ["d"],
  async run() {},
});
`,
      "dev.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Start dev server",
  aliases: ["d"],
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      'Command alias conflict: alias "d"',
    );
  });

  test("generateCommandManifest throws when alias conflicts with sibling canonical name", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy the app",
  aliases: ["dev"],
  async run() {},
});
`,
      "dev.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Start dev server",
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      '"dev" is already used by "deploy"',
    );
  });

  test("generateCommandManifest throws when root command has aliases", async () => {
    const commandsDirectory = await createCommandsFixture({
      "index.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Root command",
  aliases: ["r"],
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "Aliases on the root command are not supported",
    );
  });

  test("generateCommandManifest throws when root group has aliases", async () => {
    const commandsDirectory = await createCommandsFixture({
      "_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Root group",
  aliases: ["r"],
});
`,
      "hello.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello",
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "Aliases on the root group are not supported",
    );
  });

  test("generateCommandManifest throws when aliases cannot be statically analyzed", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

function getAliases() { return ['d']; }

export default defineCommand({
  description: "Deploy the app",
  aliases: getAliases(),
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "Could not statically analyze aliases",
    );
  });
});

describe("examples extraction", () => {
  test("generateCommandManifest extracts examples from _group.ts into manifest", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
  examples: ["mycli project create my-app", "mycli project list --all"],
});
`,
      "project/create.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
    });

    const manifest = await generateCommandManifest({ commandsDirectory });
    const projectNode = manifest.nodes.find(
      (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "project",
    );

    expect(projectNode?.examples).toEqual([
      "mycli project create my-app",
      "mycli project list --all",
    ]);
  });

  test("generateCommandManifest throws when group examples cannot be statically analyzed", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";

function makeExamples() { return ['mycli project create']; }

export default defineGroup({
  description: "Manage projects",
  examples: makeExamples(),
});
`,
      "project/create.ts": `import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a project",
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "Could not statically analyze examples",
    );
  });

  test("generateCommandManifest does not throw when command examples cannot be statically analyzed", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": `import { defineCommand } from "@rune-cli/rune";

function makeExamples() { return ['mycli deploy --env production']; }

export default defineCommand({
  description: "Deploy the app",
  examples: makeExamples(),
  async run() {},
});
`,
    });

    await expect(generateCommandManifest({ commandsDirectory })).resolves.toBeDefined();
  });
});

describe("serializeCommandManifest", () => {
  test("emits 2-space indented JSON that round-trips back to the original manifest", async () => {
    const commandsDirectory = await createCommandsFixture({
      "admin/users/index.ts": "export default {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    const serialized = serializeCommandManifest(manifest);

    expect(serialized).toBe(JSON.stringify(manifest, null, 2));
    expect(JSON.parse(serialized)).toEqual(manifest);
  });
});
