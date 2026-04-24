import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { generateCommandManifest } from "../../src/manifest/generate/generate-manifest";
import { commandNode, groupNode, setupCommandsFixtures } from "./helpers";

const { createCommandsFixture } = setupCommandsFixtures();

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
        return {
          description: descriptions[relativePath],
          aliases: [],
          examples: [],
        };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        groupNode({
          pathSegments: [],
          childNames: ["hello", "project", "user"],
        }),
        commandNode({
          pathSegments: ["hello"],
          sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
          description: "Say hello",
        }),
        commandNode({
          pathSegments: ["project"],
          sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
          childNames: ["create", "list"],
          description: "Project commands",
        }),
        commandNode({
          pathSegments: ["project", "create"],
          sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
          description: "Create a project",
        }),
        commandNode({
          pathSegments: ["project", "list"],
          sourceFilePath: path.join(commandsDirectory, "project", "list", "index.ts"),
          description: "List projects",
        }),
        groupNode({ pathSegments: ["user"], childNames: ["delete"] }),
        commandNode({
          pathSegments: ["user", "delete"],
          sourceFilePath: path.join(commandsDirectory, "user", "delete", "index.ts"),
          description: "Delete a user",
        }),
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
        commandNode({
          pathSegments: [],
          sourceFilePath: path.join(commandsDirectory, "index.ts"),
          childNames: ["hello"],
          description: "Create a project",
        }),
        commandNode({
          pathSegments: ["hello"],
          sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
          description: "Say hello",
        }),
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
        groupNode({ pathSegments: [], childNames: ["admin"] }),
        groupNode({ pathSegments: ["admin"], childNames: ["users"] }),
        commandNode({
          pathSegments: ["admin", "users"],
          sourceFilePath: path.join(commandsDirectory, "admin", "users", "index.ts"),
        }),
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
      groupNode({ pathSegments: [], childNames: ["hello"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        description: "Say hello",
      }),
    ]);
  });

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
      groupNode({ pathSegments: [], childNames: ["hello"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        description: "Say hello",
      }),
    ]);
  });
});
