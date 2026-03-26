import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

import {
  commandManifestPathToKey,
  createCommandManifestNodeMap,
  generateCommandManifest,
  serializeCommandManifest,
} from "../src/manifest/generate-manifest";

const fixtureRootDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createCommandsFixture(files: Readonly<Record<string, string>>): Promise<string> {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "rune-manifest-"));
  const commandsDirectory = path.join(rootDirectory, "src", "commands");
  fixtureRootDirectories.add(rootDirectory);

  await mkdir(commandsDirectory, { recursive: true });

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(commandsDirectory, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return commandsDirectory;
}

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
    async extractDescription(sourceFilePath) {
      const relativePath = path.relative(commandsDirectory, sourceFilePath);
      return descriptions[relativePath];
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["hello", "project", "user"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        childNames: [],
        description: "Say hello",
      },
      {
        pathSegments: ["project"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
        childNames: ["create", "list"],
        description: "Project commands",
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
        childNames: [],
        description: "Create a project",
      },
      {
        pathSegments: ["project", "list"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "list", "index.ts"),
        childNames: [],
        description: "List projects",
      },
      {
        pathSegments: ["user"],
        kind: "group",
        childNames: ["delete"],
      },
      {
        pathSegments: ["user", "delete"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "user", "delete", "index.ts"),
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
    async extractDescription(sourceFilePath) {
      const relativePath = path.relative(commandsDirectory, sourceFilePath);
      return relativePath === "index.ts" ? "Create a project" : "Say hello";
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "index.ts"),
        childNames: ["hello"],
        description: "Create a project",
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
        childNames: [],
        description: "Say hello",
      },
    ],
  });
});

test("generateCommandManifest skips empty directories and serializes to stable JSON", async () => {
  const commandsDirectory = await createCommandsFixture({
    "admin/users/index.ts": "export default {};",
  });

  const manifest = await generateCommandManifest({
    commandsDirectory,
    async extractDescription() {
      return undefined;
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["admin"],
      },
      {
        pathSegments: ["admin"],
        kind: "group",
        childNames: ["users"],
      },
      {
        pathSegments: ["admin", "users"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "admin", "users", "index.ts"),
        childNames: [],
        description: undefined,
      },
    ],
  });

  expect(commandManifestPathToKey(["admin", "users"])).toBe("admin users");
  expect(createCommandManifestNodeMap(manifest)[""]).toEqual(manifest.nodes[0]);
  expect(serializeCommandManifest(manifest)).toBe(JSON.stringify(manifest, null, 2));
});

test("generateCommandManifest throws a descriptive error for an empty commands directory", async () => {
  const commandsDirectory = await createCommandsFixture({});

  await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
    "No commands found in src/commands/. Create a command file like src/commands/hello.ts or src/commands/hello/index.ts",
  );
});

test("generateCommandManifest extracts literal descriptions from source files by default", async () => {
  const commandsDirectory = await createCommandsFixture({
    "hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const manifest = await generateCommandManifest({ commandsDirectory });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
      childNames: [],
      description: "Say hello",
    },
  ]);
});

test("generateCommandManifest discovers bare .ts command files", async () => {
  const commandsDirectory = await createCommandsFixture({
    "hello.ts": "export default {};",
    "greet.ts": "export default {};",
  });

  const manifest = await generateCommandManifest({
    commandsDirectory,
    async extractDescription() {
      return undefined;
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["greet", "hello"],
      },
      {
        pathSegments: ["greet"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "greet.ts"),
        childNames: [],
        description: undefined,
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
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
    async extractDescription(sourceFilePath) {
      const relativePath = path.relative(commandsDirectory, sourceFilePath);
      return descriptions[relativePath];
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["hello", "project"],
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "hello.ts"),
        childNames: [],
        description: "Say hello",
      },
      {
        pathSegments: ["project"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "index.ts"),
        childNames: ["create"],
        description: "Project commands",
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "create", "index.ts"),
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
    async extractDescription() {
      return undefined;
    },
  });

  expect(manifest).toEqual({
    nodes: [
      {
        pathSegments: [],
        kind: "group",
        childNames: ["project"],
      },
      {
        pathSegments: ["project"],
        kind: "group",
        childNames: ["create", "list"],
      },
      {
        pathSegments: ["project", "create"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
        childNames: [],
        description: undefined,
      },
      {
        pathSegments: ["project", "list"],
        kind: "command",
        sourceFilePath: path.join(commandsDirectory, "project", "list.ts"),
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

test("generateCommandManifest ignores bare file next to empty same-name directory", async () => {
  const commandsDirectory = await createCommandsFixture({
    "hello.ts": "export default {};",
    "hello/.gitkeep": "",
  });

  const manifest = await generateCommandManifest({
    commandsDirectory,
    async extractDescription() {
      return undefined;
    },
  });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello.ts"),
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
    async extractDescription() {
      return undefined;
    },
  });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello.ts"),
      childNames: [],
      description: undefined,
    },
  ]);
});

test("generateCommandManifest extracts descriptions from bare command files", async () => {
  const commandsDirectory = await createCommandsFixture({
    "hello.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const manifest = await generateCommandManifest({ commandsDirectory });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello.ts"),
      childNames: [],
      description: "Say hello",
    },
  ]);
});

test("generateCommandManifest extracts group description from _group.ts with defineGroup", async () => {
  const commandsDirectory = await createCommandsFixture({
    "project/_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      "",
      "export default defineGroup({",
      '  description: "Manage projects",',
      "});",
    ].join("\n"),
    "project/create.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Create a project",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const manifest = await generateCommandManifest({ commandsDirectory });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["project"],
    },
    {
      pathSegments: ["project"],
      kind: "group",
      childNames: ["create"],
      description: "Manage projects",
    },
    {
      pathSegments: ["project", "create"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "project", "create.ts"),
      childNames: [],
      description: "Create a project",
    },
  ]);
});

test("generateCommandManifest extracts root group description from _group.ts", async () => {
  const commandsDirectory = await createCommandsFixture({
    "_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      "",
      "export default defineGroup({",
      '  description: "My awesome CLI",',
      "});",
    ].join("\n"),
    "hello.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "export default defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
    ].join("\n"),
  });

  const manifest = await generateCommandManifest({ commandsDirectory });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
      description: "My awesome CLI",
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello.ts"),
      childNames: [],
      description: "Say hello",
    },
  ]);
});

test("generateCommandManifest extracts group description from variable export", async () => {
  const commandsDirectory = await createCommandsFixture({
    "project/_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      "",
      "const group = defineGroup({",
      '  description: "Manage projects",',
      "});",
      "",
      "export default group;",
    ].join("\n"),
    "project/create.ts": "export default {};",
  });

  const manifest = await generateCommandManifest({ commandsDirectory });
  const projectNode = manifest.nodes.find(
    (n) => n.pathSegments.length === 1 && n.pathSegments[0] === "project",
  );

  expect(projectNode).toEqual({
    pathSegments: ["project"],
    kind: "group",
    childNames: ["create"],
    description: "Manage projects",
  });
});

test("generateCommandManifest throws when _group.ts and index.ts coexist", async () => {
  const commandsDirectory = await createCommandsFixture({
    "project/_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      'export default defineGroup({ description: "Manage projects" });',
    ].join("\n"),
    "project/index.ts": "export default {};",
    "project/create.ts": "export default {};",
  });

  await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
    'Conflicting definitions: both "_group.ts" and "index.ts" exist in the same directory.',
  );
});

test("generateCommandManifest throws when _group.ts exists in directory with no subcommands", async () => {
  const commandsDirectory = await createCommandsFixture({
    "project/_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      'export default defineGroup({ description: "Manage projects" });',
    ].join("\n"),
  });

  await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
    "_group.ts exists but the directory has no subcommands",
  );
});

test("generateCommandManifest throws when _group.ts uses defineCommand instead of defineGroup", async () => {
  const commandsDirectory = await createCommandsFixture({
    "project/_group.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "export default defineCommand({",
      '  description: "Wrong",',
      "  async run() {},",
      "});",
    ].join("\n"),
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
    "project/_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      'export default defineGroup({ description: "" });',
    ].join("\n"),
    "project/create.ts": "export default {};",
  });

  await expect(generateCommandManifest({ commandsDirectory })).rejects.toThrow(
    'non-empty "description"',
  );
});

test("generateCommandManifest does not treat _group.ts as a bare command", async () => {
  const commandsDirectory = await createCommandsFixture({
    "_group.ts": [
      'import { defineGroup } from "@rune-cli/rune";',
      'export default defineGroup({ description: "Root" });',
    ].join("\n"),
    "hello.ts": "export default {};",
  });

  const manifest = await generateCommandManifest({
    commandsDirectory,
    async extractDescription(sourceFilePath) {
      if (sourceFilePath.endsWith("_group.ts")) {
        return "Root";
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

test("generateCommandManifest extracts descriptions from exported command variables", async () => {
  const commandsDirectory = await createCommandsFixture({
    "hello/index.ts": [
      'import { defineCommand } from "@rune-cli/rune";',
      "",
      "const command = defineCommand({",
      '  description: "Say hello",',
      "  async run() {},",
      "});",
      "",
      "export default command;",
    ].join("\n"),
  });

  const manifest = await generateCommandManifest({ commandsDirectory });

  expect(manifest.nodes).toEqual([
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: path.join(commandsDirectory, "hello", "index.ts"),
      childNames: [],
      description: "Say hello",
    },
  ]);
});
