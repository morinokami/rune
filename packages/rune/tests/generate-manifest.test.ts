import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import {
  generateCommandManifest,
  serializeCommandManifest,
} from "../src/manifest/generate/generate-manifest";
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
        return { description: descriptions[relativePath], aliases: [], examples: [] };
      },
    });

    expect(manifest).toEqual({
      nodes: [
        groupNode({ pathSegments: [], childNames: ["hello", "project", "user"] }),
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
        return { description: descriptions[relativePath], aliases: [], examples: [] };
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
        groupNode({ pathSegments: ["project"], childNames: ["create", "list"] }),
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
