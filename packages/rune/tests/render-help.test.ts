import { expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { defineCommand } from "../src";
import {
  renderCommandHelp,
  renderGroupHelp,
  renderResolvedHelp,
} from "../src/manifest/render-help";
import { resolveCommandPath } from "../src/manifest/resolve-command-path";

const manifest: CommandManifest = {
  nodes: [
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello", "project", "user"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: "/commands/hello/index.ts",
      childNames: [],
      description: "Say hello",
    },
    {
      pathSegments: ["project"],
      kind: "command",
      sourceFilePath: "/commands/project/index.ts",
      childNames: ["create", "list"],
      description: "Project commands",
    },
    {
      pathSegments: ["project", "create"],
      kind: "command",
      sourceFilePath: "/commands/project/create/index.ts",
      childNames: [],
      description: "Create a project",
    },
    {
      pathSegments: ["project", "list"],
      kind: "command",
      sourceFilePath: "/commands/project/list/index.ts",
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
      sourceFilePath: "/commands/user/delete/index.ts",
      childNames: [],
      description: "Delete a user",
    },
  ],
};

test("renderGroupHelp lists child commands using manifest metadata only", () => {
  const userGroup = manifest.nodes[5];

  if (userGroup.kind !== "group") {
    throw new Error("Expected user node to be a group");
  }

  const help = renderGroupHelp(manifest, userGroup, "mycli");

  expect(help).toContain("Usage: mycli user <command>");
  expect(help).toContain("delete  Delete a user");
});

test("renderCommandHelp includes usage, description, args, and options", async () => {
  const command = defineCommand({
    description: "Create a project",
    args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
    options: [
      { name: "name", type: "string", required: true, description: "Project name" },
      { name: "force", type: "boolean", alias: "f", description: "Overwrite existing state" },
    ],
    async run() {},
  });

  const help = await renderCommandHelp(command, ["project", "create"], "mycli");

  expect(help).toContain("Usage: mycli project create <id> [options]");
  expect(help).toContain("Description:\n  Create a project");
  expect(help).toContain("id <string>  Project identifier");
  expect(help).toContain("--name <string>  Project name");
  expect(help).toContain("-f, --force <boolean>  Overwrite existing state");
  expect(help).toContain("-h, --help  Show help");
});

test("renderResolvedHelp does not load child commands for group help", async () => {
  const route = resolveCommandPath(manifest, ["user"]);
  let loaderCalled = false;

  const help = await renderResolvedHelp({
    manifest,
    route,
    cliName: "mycli",
    async loadCommand() {
      loaderCalled = true;
      throw new Error("group help should not load commands");
    },
  });

  expect(loaderCalled).toBe(false);
  expect(help).toContain("delete  Delete a user");
});

test("renderResolvedHelp loads only the matched command for leaf help", async () => {
  const route = resolveCommandPath(manifest, ["project", "create", "--help"]);
  const loadedSourceFilePaths: string[] = [];

  const help = await renderResolvedHelp({
    manifest,
    route,
    cliName: "mycli",
    async loadCommand(node) {
      loadedSourceFilePaths.push(node.sourceFilePath);

      return defineCommand({
        description: "Create a project",
        options: [{ name: "force", type: "boolean", alias: "f" }],
        async run() {},
      });
    },
  });

  expect(loadedSourceFilePaths).toEqual(["/commands/project/create/index.ts"]);
  expect(help).toContain("Usage: mycli project create [options]");
  expect(help).toContain("-f, --force <boolean>");
});

test("renderResolvedHelp renders scoped unknown-command suggestions", async () => {
  const route = resolveCommandPath(manifest, ["project", "cretae"]);
  const help = await renderResolvedHelp({
    manifest,
    route,
    cliName: "mycli",
  });

  expect(help).toContain("Unknown command: mycli project cretae");
  expect(help).toContain("create");
  expect(help).not.toContain("hello");
});
