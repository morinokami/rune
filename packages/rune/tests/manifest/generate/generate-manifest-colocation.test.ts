import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { generateCommandManifest } from "../../../src/manifest/generate/generate-manifest";
import { commandNode, groupNode, setupCommandsFixtures } from "../../helpers";

const { createCommandsFixture } = setupCommandsFixtures();

describe("command colocation", () => {
  test("generateCommandManifest ignores private files next to bare commands", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": "export default {};",
      "_deploy-logic.ts": "export function deploy() {}",
      "_schema.ts": "export const schema = {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: path.join(commandsDirectory, "deploy.ts"),
      }),
    ]);
  });

  test("generateCommandManifest ignores private files next to directory commands", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy/index.ts": "export default {};",
      "deploy/_logic.ts": "export function deploy() {}",
      "deploy/_schema.ts": "export const schema = {};",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: path.join(commandsDirectory, "deploy", "index.ts"),
      }),
    ]);
  });

  test("generateCommandManifest ignores private directories recursively", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy/index.ts": "export default {};",
      "deploy/_internal/client.ts": "export function createClient() {}",
      "deploy/_internal/format.ts": "export function format() {}",
      "_shared/index.ts": "export default {};",
      "_shared/util.ts": "export function util() {}",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: path.join(commandsDirectory, "deploy", "index.ts"),
      }),
    ]);
  });

  test("generateCommandManifest ignores colocated test files", async () => {
    const commandsDirectory = await createCommandsFixture({
      "deploy.ts": "export default {};",
      "deploy.test.ts": "import { test } from 'vite-plus/test';",
      "deploy.spec.ts": "import { test } from 'vite-plus/test';",
      "project/index.ts": "export default {};",
      "project/index.test.ts": "import { test } from 'vite-plus/test';",
      "project/create.ts": "export default {};",
      "project/create.spec.ts": "import { test } from 'vite-plus/test';",
    });

    const manifest = await generateCommandManifest({
      commandsDirectory,
      async extractMetadata() {
        return undefined;
      },
    });

    expect(manifest.nodes).toEqual([
      groupNode({ pathSegments: [], childNames: ["deploy", "project"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: path.join(commandsDirectory, "deploy.ts"),
      }),
      commandNode({
        pathSegments: ["project"],
        sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
        childNames: ["create"],
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
      }),
    ]);
  });

  test("generateCommandManifest keeps _group.ts as reserved group metadata", async () => {
    const commandsDirectory = await createCommandsFixture({
      "project/_group.ts": `import { defineGroup } from "@rune-cli/rune";
export default defineGroup({ description: "Project commands" });`,
      "project/create.ts": "export default {};",
      "project/_logic.ts": "export function helper() {}",
      "project/create.test.ts": "import { test } from 'vite-plus/test';",
    });

    const manifest = await generateCommandManifest({ commandsDirectory });

    expect(manifest.nodes).toEqual([
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({
        pathSegments: ["project"],
        childNames: ["create"],
        description: "Project commands",
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
      }),
    ]);
  });

  test("generateCommandManifest throws when only private and test entries exist", async () => {
    const commandsDirectory = await createCommandsFixture({
      "_logic.ts": "export function helper() {}",
      "_internal/index.ts": "export default {};",
      "deploy.test.ts": "import { test } from 'vite-plus/test';",
      "project/create.spec.ts": "import { test } from 'vite-plus/test';",
    });

    await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
      "No commands found in src/commands/",
    );
  });

  test("generateCommandManifest does not conflict public commands with private entries", async () => {
    const commandsDirectory = await createCommandsFixture({
      "hello.ts": "export default {};",
      "_hello.ts": "export default {};",
      "_hello/index.ts": "export default {};",
      "hello.test.ts": "import { test } from 'vite-plus/test';",
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
});
