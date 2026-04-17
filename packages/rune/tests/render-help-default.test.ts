import type { CommandHelpData } from "@rune-cli/core";

import { describe, expect, test } from "vite-plus/test";

import type { CommandManifestGroupNode } from "../src/manifest/manifest-types";
import type {
  GroupHelpData,
  UnknownCommandHelpData,
} from "../src/manifest/runtime/build-help-data";

import { defineCommand } from "../src";
import { defineConfig } from "../src/define-config";
import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
} from "../src/manifest/runtime/build-help-data";
import { renderDefaultHelp } from "../src/manifest/runtime/render-default-help";
import { renderResolvedHelp } from "../src/manifest/runtime/render-resolved-help";
import { resolveCommandRoute } from "../src/manifest/runtime/resolve-command-route";
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

describe("renderDefaultHelp", () => {
  test("renders group help from HelpData", () => {
    const data: GroupHelpData = {
      kind: "group",
      cliName: "mycli",
      pathSegments: [],
      cliVersion: "1.0.0",
      subcommands: [
        { name: "hello", aliases: [], description: "Say hello" },
        { name: "deploy", aliases: ["d"], description: "Deploy the app" },
      ],
      frameworkOptions: [
        { name: "help", short: "h", description: "Show help" },
        { name: "version", short: "V", description: "Show the version number" },
      ],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Usage: mycli <command>");
    expect(help).toContain("hello  Say hello");
    expect(help).toContain("deploy (d)  Deploy the app");
    expect(help).toContain("-h, --help  Show help");
    expect(help).toContain("-V, --version  Show the version number");
  });

  test("renders command help from HelpData", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["create"],
      description: "Create a project",
      subcommands: [],
      arguments: [
        { name: "id", type: "string", description: "Project identifier", required: true },
      ],
      options: [
        {
          name: "name",
          type: "string",
          description: "Project name",
          default: "my-project",
          required: false,
          negatable: false,
        },
        {
          name: "force",
          short: "f",
          type: "boolean",
          description: "Force overwrite",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: ["mycli create my-app"],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Usage: mycli create <id> [options]");
    expect(help).toContain("Description:\n  Create a project");
    expect(help).toContain("id <string>  Project identifier");
    expect(help).toContain('--name <string>  Project name (default: "my-project")');
    expect(help).toContain("-f, --force  Force overwrite");
    expect(help).toContain("-h, --help  Show help");
    expect(help).toContain("  $ mycli create my-app");
  });

  test("renders command help with negatable option from HelpData", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["deploy"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "color",
          short: "c",
          type: "boolean",
          default: true,
          description: "Colorize output",
          required: false,
          negatable: true,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("-c, --color, --no-color  Colorize output");
  });

  test("renders command help with schema option from HelpData", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["run"],
      subcommands: [],
      arguments: [{ name: "target", type: undefined, description: "Build target", required: true }],
      options: [
        {
          name: "mode",
          type: undefined,
          description: "Build mode",
          required: false,
          negatable: false as const,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Usage: mycli run <target> [options]");
    expect(help).toContain("  target  Build target");
    expect(help).toContain("  --mode  Build mode");
  });

  test("renders command help without [options] when only framework options exist", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["status"],
      subcommands: [],
      arguments: [],
      options: [],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toBe("Usage: mycli status\n\nOptions:\n  -h, --help  Show help\n");
  });

  test("renders unknown command help from HelpData", () => {
    const data: UnknownCommandHelpData = {
      kind: "unknown",
      cliName: "mycli",
      attemptedPath: ["project", "cretae"],
      matchedPath: ["project"],
      unknownSegment: "cretae",
      availableSubcommands: [
        { name: "create", aliases: [], description: "Create a project" },
        { name: "list", aliases: [], description: "List projects" },
      ],
      suggestions: ["create"],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Unknown command: mycli project cretae");
    expect(help).toContain("Did you mean?");
    expect(help).toContain("  create");
  });

  test("renders unknown command help without suggestions", () => {
    const data: UnknownCommandHelpData = {
      kind: "unknown",
      cliName: "mycli",
      attemptedPath: ["xyz"],
      matchedPath: [],
      unknownSegment: "xyz",
      availableSubcommands: [{ name: "hello", aliases: [], description: "Say hello" }],
      suggestions: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toBe("Unknown command: mycli xyz\n");
    expect(help).not.toContain("Did you mean?");
  });
});

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
    const data = buildGroupHelpData({ manifest, node: userGroup, cliName: "mycli" });

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
    const data = buildGroupHelpData({ manifest: aliasManifest, node: rootGroup, cliName: "mycli" });

    expect(data.subcommands[0]).toEqual({
      name: "deploy",
      aliases: ["d", "dep"],
      description: "Deploy the app",
    });
  });

  test("buildCommandHelpData produces correct argument and option entries", async () => {
    const command = defineCommand({
      description: "Create a project",
      args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
      options: [
        { name: "name", type: "string", required: true, description: "Project name" },
        { name: "color", type: "boolean", default: true, description: "Colorize output" },
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

    if (route.kind !== "unknown") {
      throw new Error("Expected unknown route");
    }

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

  test("buildCommandHelpData + renderDefaultHelp matches renderResolvedHelp", async () => {
    const route = resolveCommandRoute(manifest, ["project", "create", "--help"]);
    const command = defineCommand({
      description: "Create a project",
      args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
      options: [
        { name: "name", type: "string", default: "my-project", description: "Project name" },
        { name: "force", type: "boolean", short: "f", description: "Force overwrite" },
      ],
      async run() {},
    });

    const fromData = renderDefaultHelp(
      await buildCommandHelpData({
        command,
        pathSegments: ["project", "create"],
        cliName: "mycli",
      }),
    );
    const fromResolved = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    expect(fromData).toBe(fromResolved);
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

describe("defineConfig", () => {
  test("defineConfig returns a config with renderHelp", () => {
    const config = defineConfig({
      renderHelp() {
        return "custom\n";
      },
    });

    expect(config.renderHelp).toBeDefined();
    expect(
      config.renderHelp!({
        kind: "group",
        cliName: "test",
        pathSegments: [],
        subcommands: [],
        frameworkOptions: [],
        examples: [],
      }),
    ).toBe("custom\n");
  });

  test("defineConfig with empty input returns config without renderHelp", () => {
    const config = defineConfig({});
    expect(config.renderHelp).toBeUndefined();
  });
});
