import { describe, expect, test } from "vite-plus/test";

import type { CommandManifest, CommandManifestGroupNode } from "../src/manifest/manifest-types";

import { buildGroupHelpData } from "../src/manifest/runtime/build-help-data";
import { renderDefaultHelp } from "../src/manifest/runtime/render-default-help";
import { commandNode, groupNode, manifest as buildManifest } from "./helpers";

const manifest = buildManifest([
  groupNode({ pathSegments: [], childNames: ["hello", "project", "user"] }),
  commandNode({
    pathSegments: ["hello"],
    sourceFilePath: "/commands/hello/index.ts",
    description: "Say hello",
  }),
  commandNode({
    pathSegments: ["project"],
    sourceFilePath: "/commands/project/index.ts",
    childNames: ["create", "list"],
    description: "Project commands",
  }),
  commandNode({
    pathSegments: ["project", "create"],
    sourceFilePath: "/commands/project/create/index.ts",
    description: "Create a project",
  }),
  commandNode({
    pathSegments: ["project", "list"],
    sourceFilePath: "/commands/project/list/index.ts",
    description: "List projects",
  }),
  groupNode({ pathSegments: ["user"], childNames: ["delete"] }),
  commandNode({
    pathSegments: ["user", "delete"],
    sourceFilePath: "/commands/user/delete/index.ts",
    description: "Delete a user",
  }),
]);

function renderGroupHelpText(options: {
  readonly manifest: CommandManifest;
  readonly node: CommandManifestGroupNode;
  readonly cliName: string;
  readonly version?: string;
}): string {
  return renderDefaultHelp(buildGroupHelpData(options));
}

describe("group help", () => {
  test("group help lists child commands using manifest metadata only", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelpText({ manifest, node: userGroup, cliName: "mycli" });

    expect(help).toContain("Usage: mycli user <command>");
    expect(help).toContain("delete  Delete a user");
    expect(help).toContain("-h, --help");
    expect(help).not.toContain("--version");
  });

  test("group help shows --version for the root group when version is set", () => {
    const rootGroup = manifest.nodes[0];

    if (rootGroup.kind !== "group") {
      throw new Error("Expected root node to be a group");
    }

    const help = renderGroupHelpText({
      manifest,
      node: rootGroup,
      cliName: "mycli",
      version: "1.0.0",
    });

    expect(help).toContain("-V, --version");
    expect(help).toContain("-h, --help");
  });

  test("group help does not show --version for the root group when version is not set", () => {
    const rootGroup = manifest.nodes[0];

    if (rootGroup.kind !== "group") {
      throw new Error("Expected root node to be a group");
    }

    const help = renderGroupHelpText({ manifest, node: rootGroup, cliName: "mycli" });

    expect(help).not.toContain("--version");
    expect(help).toContain("-h, --help");
  });

  test("group help shows description above usage when present", () => {
    const manifestWithGroupDescription = buildManifest([
      groupNode({
        pathSegments: ["project"],
        childNames: ["create", "list"],
        description: "Manage projects",
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/commands/project/create/index.ts",
        description: "Create a project",
      }),
      commandNode({
        pathSegments: ["project", "list"],
        sourceFilePath: "/commands/project/list/index.ts",
        description: "List projects",
      }),
    ]);

    const groupNodeFixture = manifestWithGroupDescription.nodes[0];

    if (groupNodeFixture.kind !== "group") {
      throw new Error("Expected group node");
    }

    const help = renderGroupHelpText({
      manifest: manifestWithGroupDescription,
      node: groupNodeFixture,
      cliName: "mycli",
    });

    const lines = help.split("\n");
    const descriptionIndex = lines.findIndex((line) => line === "Manage projects");
    const usageIndex = lines.findIndex((line) => line.startsWith("Usage:"));

    expect(descriptionIndex).toBeGreaterThanOrEqual(0);
    expect(usageIndex).toBeGreaterThan(descriptionIndex);
    expect(help).toContain("create  Create a project");
    expect(help).toContain("list  List projects");
  });

  test("group help omits description section when not present", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelpText({ manifest, node: userGroup, cliName: "mycli" });

    const lines = help.split("\n");
    expect(lines[0]).toBe("Usage: mycli user <command>");
  });

  test("group help shows aliases next to child command names", () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy", "project"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["d"],
        description: "Deploy the app",
      }),
      groupNode({
        pathSegments: ["project"],
        childNames: ["create"],
        aliases: ["p"],
        description: "Manage projects",
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/commands/project/create.ts",
        aliases: ["c"],
        description: "Create a project",
      }),
    ]);

    const rootGroup = aliasManifest.nodes[0];

    if (rootGroup.kind !== "group") {
      throw new Error("Expected root node to be a group");
    }

    const help = renderGroupHelpText({
      manifest: aliasManifest,
      node: rootGroup,
      cliName: "mycli",
    });

    expect(help).toContain("deploy (d)  Deploy the app");
    expect(help).toContain("project (p)  Manage projects");
  });

  test("group help shows examples section when examples are present on group node", () => {
    const manifestWithExamples = buildManifest([
      groupNode({
        pathSegments: ["project"],
        childNames: ["create", "list"],
        description: "Manage projects",
        examples: ["mycli project create my-app", "mycli project list --all"],
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/commands/project/create/index.ts",
        description: "Create a project",
      }),
      commandNode({
        pathSegments: ["project", "list"],
        sourceFilePath: "/commands/project/list/index.ts",
        description: "List projects",
      }),
    ]);

    const groupNodeFixture = manifestWithExamples.nodes[0];

    if (groupNodeFixture.kind !== "group") {
      throw new Error("Expected group node");
    }

    const help = renderGroupHelpText({
      manifest: manifestWithExamples,
      node: groupNodeFixture,
      cliName: "mycli",
    });

    expect(help).toContain("Examples:");
    expect(help).toContain("  $ mycli project create my-app");
    expect(help).toContain("  $ mycli project list --all");
  });

  test("group help omits examples section when no examples are present", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelpText({ manifest, node: userGroup, cliName: "mycli" });

    expect(help).not.toContain("Examples:");
  });
});
