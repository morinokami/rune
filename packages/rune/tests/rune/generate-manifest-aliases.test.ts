import { describe, expect, test } from "vite-plus/test";

import { generateCommandManifest } from "../../src/manifest/generate/generate-manifest";
import { setupCommandsFixtures } from "./helpers";

const { createCommandsFixture } = setupCommandsFixtures();

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
