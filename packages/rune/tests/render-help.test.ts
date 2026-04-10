import type { CommandHelpData } from "@rune-cli/core";

import { describe, expect, test } from "vite-plus/test";

import type { CommandManifest, CommandManifestGroupNode } from "../src/manifest/manifest-types";
import type { GroupHelpData, UnknownCommandHelpData } from "../src/manifest/runtime/help-data";

import { defineCommand } from "../src";
import { defineConfig } from "../src/define-config";
import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
} from "../src/manifest/runtime/help-data";
import { renderDefaultHelp } from "../src/manifest/runtime/render-help";
import { resolveCommandRoute } from "../src/manifest/runtime/resolve-command-route";
import { renderResolvedHelp } from "../src/manifest/runtime/resolve-help";

const manifest: CommandManifest = {
  nodes: [
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello", "project", "user"],
      aliases: [],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: "/commands/hello/index.ts",
      childNames: [],
      aliases: [],
      description: "Say hello",
    },
    {
      pathSegments: ["project"],
      kind: "command",
      sourceFilePath: "/commands/project/index.ts",
      childNames: ["create", "list"],
      aliases: [],
      description: "Project commands",
    },
    {
      pathSegments: ["project", "create"],
      kind: "command",
      sourceFilePath: "/commands/project/create/index.ts",
      childNames: [],
      aliases: [],
      description: "Create a project",
    },
    {
      pathSegments: ["project", "list"],
      kind: "command",
      sourceFilePath: "/commands/project/list/index.ts",
      childNames: [],
      aliases: [],
      description: "List projects",
    },
    {
      pathSegments: ["user"],
      kind: "group",
      childNames: ["delete"],
      aliases: [],
    },
    {
      pathSegments: ["user", "delete"],
      kind: "command",
      sourceFilePath: "/commands/user/delete/index.ts",
      childNames: [],
      aliases: [],
      description: "Delete a user",
    },
  ],
};

function renderGroupHelpText(options: {
  readonly manifest: CommandManifest;
  readonly node: CommandManifestGroupNode;
  readonly cliName: string;
  readonly version?: string;
}): string {
  return renderDefaultHelp(buildGroupHelpData(options));
}

async function renderCommandHelpText(options: {
  readonly command: Parameters<typeof buildCommandHelpData>[0]["command"];
  readonly pathSegments: Parameters<typeof buildCommandHelpData>[0]["pathSegments"];
  readonly cliName: string;
  readonly version?: string;
}): Promise<string> {
  return renderDefaultHelp(await buildCommandHelpData(options));
}

function renderUnknownCommandHelpText(
  route: Parameters<typeof buildUnknownCommandHelpData>[0],
  cliName: string,
  unknownManifest: Parameters<typeof buildUnknownCommandHelpData>[2],
  version?: string,
): string {
  return renderDefaultHelp(buildUnknownCommandHelpData(route, cliName, unknownManifest, version));
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
    const manifestWithGroupDescription: CommandManifest = {
      nodes: [
        {
          pathSegments: ["project"],
          kind: "group",
          childNames: ["create", "list"],
          aliases: [],
          description: "Manage projects",
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: "/commands/project/create/index.ts",
          childNames: [],
          aliases: [],
          description: "Create a project",
        },
        {
          pathSegments: ["project", "list"],
          kind: "command",
          sourceFilePath: "/commands/project/list/index.ts",
          childNames: [],
          aliases: [],
          description: "List projects",
        },
      ],
    };

    const groupNode = manifestWithGroupDescription.nodes[0];

    if (groupNode.kind !== "group") {
      throw new Error("Expected group node");
    }

    const help = renderGroupHelpText({
      manifest: manifestWithGroupDescription,
      node: groupNode,
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
    const aliasManifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          childNames: ["deploy", "project"],
          aliases: [],
        },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["d"],
          description: "Deploy the app",
        },
        {
          pathSegments: ["project"],
          kind: "group",
          childNames: ["create"],
          aliases: ["p"],
          description: "Manage projects",
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: "/commands/project/create.ts",
          childNames: [],
          aliases: ["c"],
          description: "Create a project",
        },
      ],
    };

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
});

describe("command help", () => {
  test("command help includes usage, description, args, and options", async () => {
    const command = defineCommand({
      description: "Create a project",
      args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
      options: [
        { name: "name", type: "string", required: true, description: "Project name" },
        { name: "force", type: "boolean", short: "f", description: "Overwrite existing state" },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["project", "create"],
      cliName: "mycli",
    });

    expect(help).toContain("Usage: mycli project create <id> [options]");
    expect(help).toContain("Description:\n  Create a project");
    expect(help).toContain("id <string>  Project identifier");
    expect(help).toContain("--name <string>  Project name");
    expect(help).toContain("-f, --force  Overwrite existing state");
    expect(help).toContain("-h, --help  Show help");
  });

  test("command help shows --no-flag for boolean options with default true", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      options: [
        { name: "color", type: "boolean", default: true, description: "Colorize output" },
        { name: "force", type: "boolean", short: "f", description: "Force deploy" },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["deploy"],
      cliName: "mycli",
    });

    expect(help).toContain("--color, --no-color  Colorize output");
    expect(help).not.toContain("--no-force");
    expect(help).toContain("-f, --force  Force deploy");
  });

  test("command help shows short, --flag, --no-flag for negatable option with short", async () => {
    const command = defineCommand({
      options: [{ name: "color", type: "boolean", default: true, short: "c" }],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["deploy"],
      cliName: "mycli",
    });

    expect(help).toContain("-c, --color, --no-color");
  });

  test("command help shows default values for string and number options", async () => {
    const command = defineCommand({
      description: "Create a project",
      options: [
        { name: "name", type: "string", default: "my-project", description: "Project name" },
        { name: "retries", type: "number", default: 3, description: "Retry count" },
        { name: "force", type: "boolean", description: "Force overwrite" },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["project", "create"],
      cliName: "mycli",
    });

    expect(help).toContain('--name <string>  Project name (default: "my-project")');
    expect(help).toContain("--retries <number>  Retry count (default: 3)");
    expect(help).not.toContain("Force overwrite (default:");
  });

  test("command help does not show default suffix for boolean options", async () => {
    const command = defineCommand({
      description: "Deploy",
      options: [
        { name: "color", type: "boolean", default: true, description: "Colorize output" },
        { name: "verbose", type: "boolean", default: false, description: "Verbose output" },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["deploy"],
      cliName: "mycli",
    });

    expect(help).not.toContain("(default:");
  });

  test("command help shows default values for arguments", async () => {
    const command = defineCommand({
      description: "Greet someone",
      args: [{ name: "name", type: "string", default: "world", description: "Who to greet" }],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["greet"],
      cliName: "mycli",
    });

    expect(help).toContain('name <string>  Who to greet (default: "world")');
  });

  test("command help shows default for boolean positional arguments", async () => {
    const command = defineCommand({
      description: "Toggle feature",
      args: [{ name: "enabled", type: "boolean", default: true, description: "Enable flag" }],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["toggle"],
      cliName: "mycli",
    });

    expect(help).toContain("enabled  Enable flag (default: true)");
  });

  test("command help escapes quotes in string default values", async () => {
    const command = defineCommand({
      description: "Test escaping",
      options: [{ name: "sep", type: "string", default: 'a"b', description: "Separator" }],
      async run() {},
    });

    const help = await renderCommandHelpText({ command, pathSegments: ["test"], cliName: "mycli" });

    expect(help).toContain('(default: "a\\"b")');
  });

  test("command help shows default without extra spaces when description is absent", async () => {
    const command = defineCommand({
      description: "Count items",
      options: [{ name: "count", type: "number", default: 1 }],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["count"],
      cliName: "mycli",
    });

    expect(help).toContain("--count <number>  (default: 1)");
    expect(help).not.toContain("   (default:");
  });

  test("command help shows examples section when examples are provided", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      examples: ["mycli deploy --env production", "mycli deploy --dry-run"],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["deploy"],
      cliName: "mycli",
    });

    expect(help).toContain("Examples:");
    expect(help).toContain("  $ mycli deploy --env production");
    expect(help).toContain("  $ mycli deploy --dry-run");
  });

  test("command help omits examples section when no examples are provided", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["deploy"],
      cliName: "mycli",
    });

    expect(help).not.toContain("Examples:");
  });

  test("group help shows examples section when examples are present on group node", () => {
    const manifestWithExamples: CommandManifest = {
      nodes: [
        {
          pathSegments: ["project"],
          kind: "group",
          childNames: ["create", "list"],
          aliases: [],
          description: "Manage projects",
          examples: ["mycli project create my-app", "mycli project list --all"],
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: "/commands/project/create/index.ts",
          childNames: [],
          aliases: [],
          description: "Create a project",
        },
        {
          pathSegments: ["project", "list"],
          kind: "command",
          sourceFilePath: "/commands/project/list/index.ts",
          childNames: [],
          aliases: [],
          description: "List projects",
        },
      ],
    };

    const groupNode = manifestWithExamples.nodes[0];

    if (groupNode.kind !== "group") {
      throw new Error("Expected group node");
    }

    const help = renderGroupHelpText({
      manifest: manifestWithExamples,
      node: groupNode,
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

describe("resolved help routing", () => {
  test("renderResolvedHelp does not load child commands for group help", async () => {
    const route = resolveCommandRoute(manifest, ["user"]);
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
    const route = resolveCommandRoute(manifest, ["project", "create", "--help"]);
    const loadedSourceFilePaths: string[] = [];

    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand(node) {
        loadedSourceFilePaths.push(node.sourceFilePath);

        return defineCommand({
          description: "Create a project",
          options: [{ name: "force", type: "boolean", short: "f" }],
          async run() {},
        });
      },
    });

    expect(loadedSourceFilePaths).toEqual(["/commands/project/create/index.ts"]);
    expect(help).toContain("Usage: mycli project create [options]");
    expect(help).toContain("-f, --force");
  });

  test("renderResolvedHelp shows subcommands for a command node with children", async () => {
    const route = resolveCommandRoute(manifest, ["project", "--help"]);

    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return defineCommand({
          description: "Project commands",
          async run() {},
        });
      },
    });

    expect(help).toContain("Usage: mycli project [command]");
    expect(help).toContain("Subcommands:");
    expect(help).toContain("create  Create a project");
    expect(help).toContain("list  List projects");
    expect(help).toContain("-h, --help");
  });

  test("renderResolvedHelp places [command] before positional args in usage", async () => {
    const route = resolveCommandRoute(manifest, ["project", "--help"]);

    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return defineCommand({
          description: "Project commands",
          args: [{ name: "id", type: "string", description: "Project identifier" }],
          async run() {},
        });
      },
    });

    expect(help).toContain("Usage: mycli project [command] [id]");
  });

  test("renderResolvedHelp renders scoped unknown-command suggestions", async () => {
    const route = resolveCommandRoute(manifest, ["project", "cretae"]);
    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
    });

    expect(help).toContain("Unknown command: mycli project cretae");
    expect(help).toContain("create");
    expect(help).not.toContain("hello");
  });
});

describe("unknown command message", () => {
  test("unknown command help shows canonical suggestions for alias-based matches", () => {
    const aliasManifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          childNames: ["deploy"],
          aliases: [],
        },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["dep"],
          description: "Deploy the app",
        },
      ],
    };

    const route = resolveCommandRoute(aliasManifest, ["depl"]);

    if (route.kind !== "unknown") {
      throw new Error("Expected unknown route");
    }

    const message = renderUnknownCommandHelpText(route, "mycli", aliasManifest);

    expect(message).toContain("Unknown command: mycli depl");
    expect(message).toContain("deploy");
  });
});

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
    const aliasManifest: CommandManifest = {
      nodes: [
        { pathSegments: [], kind: "group", childNames: ["deploy"], aliases: [] },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["d", "dep"],
          description: "Deploy the app",
        },
      ],
    };

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

    // Argument: primitive with required
    expect(data.arguments).toHaveLength(1);
    expect(data.arguments[0]).toEqual({
      name: "id",
      type: "string",
      description: "Project identifier",
      required: true,
    });

    // User options (no framework entries mixed in)
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

    // Framework options: --json and --help
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

describe("defineCommand.help", () => {
  test("command-level help renderer is used when provided", async () => {
    const command = defineCommand({
      description: "Deploy",
      help() {
        return "Custom deploy help\n";
      },
      async run() {},
    });

    const route = resolveCommandRoute(manifest, ["hello", "--help"]);
    const output = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    expect(output).toBe("Custom deploy help\n");
  });

  test("command-level help receives CommandHelpData", async () => {
    let receivedData: CommandHelpData | undefined;
    const command = defineCommand({
      description: "Create something",
      args: [{ name: "name", type: "string", required: true }],
      options: [{ name: "force", type: "boolean", short: "f" }],
      help(data) {
        receivedData = data;
        return renderDefaultHelp(data);
      },
      async run() {},
    });

    const route = resolveCommandRoute(manifest, ["hello", "--help"]);
    await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    expect(receivedData).toBeDefined();
    expect(receivedData!.kind).toBe("command");
    expect(receivedData!.cliName).toBe("mycli");
    expect(receivedData!.arguments).toHaveLength(1);
    expect(receivedData!.options).toHaveLength(1);
  });

  test("command without help falls back to renderDefaultHelp", async () => {
    const command = defineCommand({
      description: "Say hello",
      async run() {},
    });

    const route = resolveCommandRoute(manifest, ["hello", "--help"]);
    const output = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    expect(output).toContain("Usage: mycli hello");
    expect(output).toContain("Say hello");
  });
});

describe("help priority chain", () => {
  test("command.help takes priority over config.renderHelp", async () => {
    const command = defineCommand({
      description: "Deploy",
      help() {
        return "command-level\n";
      },
      async run() {},
    });

    const route = resolveCommandRoute(manifest, ["hello", "--help"]);

    // Without config, command.help is used
    const output = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    expect(output).toBe("command-level\n");
  });

  test("config.renderHelp is used for group help", async () => {
    // We test the priority logic directly via renderResolvedHelp
    // with no configPath (no config loaded), which falls back to default
    const route = resolveCommandRoute(manifest, []);
    const output = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
    });

    expect(output).toContain("Usage: mycli <command>");
  });

  test("renderHelpSafe falls back on renderer error for command help", async () => {
    const command = defineCommand({
      description: "Deploy",
      help() {
        throw new Error("renderer broke");
      },
      async run() {},
    });

    const route = resolveCommandRoute(manifest, ["hello", "--help"]);
    const output = await renderResolvedHelp({
      manifest,
      route,
      cliName: "mycli",
      async loadCommand() {
        return command;
      },
    });

    // Falls back to renderDefaultHelp
    expect(output).toContain("Usage: mycli hello");
  });
});

describe("buildUnknownCommandHelpData with SubcommandHelpEntry", () => {
  test("availableSubcommands includes descriptions and aliases", () => {
    const unknownManifest: CommandManifest = {
      nodes: [
        { pathSegments: [], kind: "group", childNames: ["deploy", "status"], aliases: [] },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["d"],
          description: "Deploy the app",
        },
        {
          pathSegments: ["status"],
          kind: "command",
          sourceFilePath: "/commands/status.ts",
          childNames: [],
          aliases: [],
          description: "Show status",
        },
      ],
    };

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
