import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { generateCommandManifest } from "../src/manifest/generate/generate-manifest";
import { commandNode, groupNode, setupCommandsFixtures } from "./helpers";

const { createCommandsFixture } = setupCommandsFixtures();

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
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({
        pathSegments: ["project"],
        childNames: ["create"],
        description: "Manage projects",
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
        description: "Create a project",
      }),
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
      groupNode({ pathSegments: [], childNames: ["hello"], description: "My awesome CLI" }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        description: "Say hello",
      }),
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

    expect(projectNode).toEqual(
      groupNode({
        pathSegments: ["project"],
        childNames: ["create"],
        description: "Manage projects",
      }),
    );
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
