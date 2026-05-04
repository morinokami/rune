import { assert, describe, expect, test } from "vite-plus/test";

import type { CommandManifestGroupNode } from "../../src/manifest/manifest-types";

import { defineCommand } from "../../src";
import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
} from "../../src/help/build-help-data";
import { toHelpJson } from "../../src/help/help-json";
import { resolveCommandRoute } from "../../src/routing/resolve-command-route";
import { commandNode, groupNode, manifest as buildManifest } from "../helpers";

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

describe("help data builders", () => {
  test("buildGroupHelpData produces correct shape for root group with version", () => {
    const rootGroup = manifest.nodes[0] as CommandManifestGroupNode;
    const data = buildGroupHelpData({
      manifest,
      node: rootGroup,
      cliName: "mycli",
      version: "1.0.0",
    });

    expect(data.kind).toBe("group");
    expect(data.cliName).toBe("mycli");
    expect(data.pathSegments).toEqual([]);
    expect(data.cliVersion).toBe("1.0.0");
    expect(data.subcommands).toEqual([
      { name: "hello", aliases: [], description: "Say hello" },
      { name: "project", aliases: [], description: "Project commands" },
      { name: "user", aliases: [], description: undefined },
    ]);
    expect(data.frameworkOptions).toHaveLength(2);
    expect(data.frameworkOptions[0]).toEqual({
      name: "help",
      short: "h",
      description: "Show help",
    });
    expect(data.frameworkOptions[1]).toEqual({
      name: "version",
      short: "V",
      description: "Show the version number",
    });
  });

  test("buildGroupHelpData omits version option for non-root group", () => {
    const userGroup = manifest.nodes[5] as CommandManifestGroupNode;
    const data = buildGroupHelpData({
      manifest,
      node: userGroup,
      cliName: "mycli",
    });

    expect(data.cliName).toBe("mycli");
    expect(data.pathSegments).toEqual(["user"]);
    expect(data.cliVersion).toBeUndefined();
    expect(data.frameworkOptions).toHaveLength(1);
    expect(data.frameworkOptions[0]).toMatchObject({ name: "help" });
  });

  test("buildGroupHelpData resolves child aliases", () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["d", "dep"],
        description: "Deploy the app",
      }),
    ]);

    const rootGroup = aliasManifest.nodes[0] as CommandManifestGroupNode;
    const data = buildGroupHelpData({
      manifest: aliasManifest,
      node: rootGroup,
      cliName: "mycli",
    });

    expect(data.subcommands[0]).toEqual({
      name: "deploy",
      aliases: ["d", "dep"],
      description: "Deploy the app",
    });
  });

  test("buildCommandHelpData produces correct argument and option entries", async () => {
    const command = defineCommand({
      description: "Create a project",
      options: [
        {
          name: "name",
          type: "string",
          env: "PROJECT_NAME",
          required: true,
          description: "Project name",
        },
        {
          name: "color",
          type: "boolean",
          default: true,
          description: "Colorize output",
        },
      ],
      args: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Project identifier",
        },
      ],
      json: true,
      async run() {},
    });

    const data = await buildCommandHelpData({
      command,
      pathSegments: ["project", "create"],
      cliName: "mycli",
    });

    expect(data.kind).toBe("command");
    expect(data.cliName).toBe("mycli");
    expect(data.pathSegments).toEqual(["project", "create"]);
    expect(data.description).toBe("Create a project");

    expect(data.arguments).toHaveLength(1);
    expect(data.arguments[0]).toEqual({
      name: "id",
      type: "string",
      description: "Project identifier",
      required: true,
    });

    expect(data.options).toHaveLength(2);
    expect(data.options[0]).toMatchObject({
      name: "name",
      type: "string",
      env: "PROJECT_NAME",
      required: true,
      negatable: false,
    });
    expect(data.options[1]).toMatchObject({
      name: "color",
      type: "boolean",
      default: true,
      negatable: true,
    });

    expect(data.frameworkOptions).toHaveLength(2);
    expect(data.frameworkOptions[0]).toEqual({
      name: "json",
      description: "Output structured results as JSON",
    });
    expect(data.frameworkOptions[1]).toEqual({
      name: "help",
      short: "h",
      description: "Show help",
    });
    expect(data.stdout).toEqual({ kind: "text", jsonFlag: true });

    const json = toHelpJson({ data, aliases: [] });
    if (json.kind !== "command") throw new Error("Expected command help JSON");

    expect(json.options[0]).toMatchObject({
      name: "name",
      env: "PROJECT_NAME",
    });
    expect(json.stdout).toEqual({ kind: "text", jsonFlag: true });
  });

  test("buildCommandHelpData exposes JSON Lines stdout contracts", async () => {
    const command = defineCommand({
      jsonl: true,
      async *run() {
        yield { id: "a" };
      },
    });

    const data = await buildCommandHelpData({
      command,
      pathSegments: ["events"],
      cliName: "mycli",
    });

    expect(data.frameworkOptions).toEqual([{ name: "help", short: "h", description: "Show help" }]);
    expect(data.stdout).toEqual({ kind: "json-lines", jsonFlag: false });
  });

  test("buildCommandHelpData includes subcommands when provided", async () => {
    const command = defineCommand({
      description: "Project commands",
      async run() {},
    });

    const subcommands = [
      { name: "create", aliases: ["c"], description: "Create a project" },
      { name: "list", aliases: [], description: "List projects" },
    ];

    const data = await buildCommandHelpData({
      command,
      pathSegments: ["project"],
      cliName: "mycli",
      subcommands,
    });

    expect(data.subcommands).toEqual(subcommands);
  });

  test("buildUnknownCommandHelpData preserves all route data", () => {
    const route = resolveCommandRoute(manifest, ["project", "cretae"]);

    assert(route.kind === "unknown");

    const data = buildUnknownCommandHelpData(route, "mycli", manifest);

    expect(data.kind).toBe("unknown");
    expect(data.cliName).toBe("mycli");
    expect(data.attemptedPath).toEqual(["project", "cretae"]);
    expect(data.matchedPath).toEqual(["project"]);
    expect(data.unknownSegment).toBe("cretae");
    expect(data.availableSubcommands).toEqual([
      { name: "create", aliases: [], description: "Create a project" },
      { name: "list", aliases: [], description: "List projects" },
    ]);
    expect(data.suggestions).toContain("create");
  });
});

describe("buildUnknownCommandHelpData with SubcommandHelpEntry", () => {
  test("availableSubcommands includes descriptions and aliases", () => {
    const unknownManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy", "status"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["d"],
        description: "Deploy the app",
      }),
      commandNode({
        pathSegments: ["status"],
        sourceFilePath: "/commands/status.ts",
        description: "Show status",
      }),
    ]);

    const route = resolveCommandRoute(unknownManifest, ["deplyo"]);
    if (route.kind !== "unknown") throw new Error("Expected unknown route");

    const data = buildUnknownCommandHelpData(route, "mycli", unknownManifest);

    expect(data.availableSubcommands).toEqual([
      { name: "deploy", aliases: ["d"], description: "Deploy the app" },
      { name: "status", aliases: [], description: "Show status" },
    ]);
  });
});
