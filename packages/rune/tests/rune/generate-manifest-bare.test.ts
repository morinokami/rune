import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { generateCommandManifest } from "../../src/manifest/generate/generate-manifest";
import { commandNode, groupNode, setupCommandsFixtures } from "./helpers";

const { createCommandsFixture } = setupCommandsFixtures();

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
        groupNode({ pathSegments: [], childNames: ["greet", "hello"] }),
        commandNode({
          pathSegments: ["greet"],
          sourceFilePath: path.join(commandsDirectory, "greet.ts"),
        }),
        commandNode({
          pathSegments: ["hello"],
          sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        }),
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
        return {
          description: descriptions[relativePath],
          aliases: [],
          examples: [],
        };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        groupNode({ pathSegments: [], childNames: ["hello", "project"] }),
        commandNode({
          pathSegments: ["hello"],
          sourceFilePath: path.join(commandsDirectory, "hello.ts"),
          description: "Say hello",
        }),
        commandNode({
          pathSegments: ["project"],
          sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
          childNames: ["create"],
          description: "Project commands",
        }),
        commandNode({
          pathSegments: ["project", "create"],
          sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
          description: "Create a project",
        }),
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
        groupNode({ pathSegments: [], childNames: ["project"] }),
        groupNode({
          pathSegments: ["project"],
          childNames: ["create", "list"],
        }),
        commandNode({
          pathSegments: ["project", "create"],
          sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
        }),
        commandNode({
          pathSegments: ["project", "list"],
          sourceFilePath: path.join(commandsDirectory, "project", "list.ts"),
        }),
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
      groupNode({ pathSegments: [], childNames: ["hello"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
      }),
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
      groupNode({ pathSegments: [], childNames: ["hello"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
      }),
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
      groupNode({ pathSegments: [], childNames: ["hello"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        description: "Say hello",
      }),
    ]);
  });
});
