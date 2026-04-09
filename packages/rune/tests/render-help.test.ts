import { describe, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { defineCommand } from "../src";
import { renderGroupHelp, renderUnknownCommandMessage } from "../src/manifest/runtime/render-help";
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

describe("group help", () => {
  test("renderGroupHelp lists child commands using manifest metadata only", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelp({ manifest, node: userGroup, cliName: "mycli" });

    expect(help).toContain("Usage: mycli user <command>");
    expect(help).toContain("delete  Delete a user");
    expect(help).toContain("-h, --help");
    expect(help).not.toContain("--version");
  });

  test("renderGroupHelp shows --version for the root group when version is set", () => {
    const rootGroup = manifest.nodes[0];

    if (rootGroup.kind !== "group") {
      throw new Error("Expected root node to be a group");
    }

    const help = renderGroupHelp({ manifest, node: rootGroup, cliName: "mycli", version: "1.0.0" });

    expect(help).toContain("-V, --version");
    expect(help).toContain("-h, --help");
  });

  test("renderGroupHelp does not show --version for the root group when version is not set", () => {
    const rootGroup = manifest.nodes[0];

    if (rootGroup.kind !== "group") {
      throw new Error("Expected root node to be a group");
    }

    const help = renderGroupHelp({ manifest, node: rootGroup, cliName: "mycli" });

    expect(help).not.toContain("--version");
    expect(help).toContain("-h, --help");
  });

  test("renderGroupHelp shows description above usage when present", () => {
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

    const help = renderGroupHelp({
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

  test("renderGroupHelp omits description section when not present", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelp({ manifest, node: userGroup, cliName: "mycli" });

    const lines = help.split("\n");
    expect(lines[0]).toBe("Usage: mycli user <command>");
  });

  test("renderGroupHelp shows aliases next to child command names", () => {
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

    const help = renderGroupHelp({ manifest: aliasManifest, node: rootGroup, cliName: "mycli" });

    expect(help).toContain("deploy (d)  Deploy the app");
    expect(help).toContain("project (p)  Manage projects");
  });
});

describe("command help", () => {
  test("renderCommandHelp includes usage, description, args, and options", async () => {
    const command = defineCommand({
      description: "Create a project",
      args: [{ name: "id", type: "string", required: true, description: "Project identifier" }],
      options: [
        { name: "name", type: "string", required: true, description: "Project name" },
        { name: "force", type: "boolean", short: "f", description: "Overwrite existing state" },
      ],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["project", "create"], "mycli");

    expect(help).toContain("Usage: mycli project create <id> [options]");
    expect(help).toContain("Description:\n  Create a project");
    expect(help).toContain("id <string>  Project identifier");
    expect(help).toContain("--name <string>  Project name");
    expect(help).toContain("-f, --force  Overwrite existing state");
    expect(help).toContain("-h, --help  Show help");
  });

  test("renderCommandHelp shows --no-flag for boolean options with default true", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      options: [
        { name: "color", type: "boolean", default: true, description: "Colorize output" },
        { name: "force", type: "boolean", short: "f", description: "Force deploy" },
      ],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["deploy"], "mycli");

    expect(help).toContain("--color, --no-color  Colorize output");
    expect(help).not.toContain("--no-force");
    expect(help).toContain("-f, --force  Force deploy");
  });

  test("renderCommandHelp shows short, --flag, --no-flag for negatable option with short", async () => {
    const command = defineCommand({
      options: [{ name: "color", type: "boolean", default: true, short: "c" }],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["deploy"], "mycli");

    expect(help).toContain("-c, --color, --no-color");
  });

  test("renderCommandHelp shows default values for string and number options", async () => {
    const command = defineCommand({
      description: "Create a project",
      options: [
        { name: "name", type: "string", default: "my-project", description: "Project name" },
        { name: "retries", type: "number", default: 3, description: "Retry count" },
        { name: "force", type: "boolean", description: "Force overwrite" },
      ],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["project", "create"], "mycli");

    expect(help).toContain('--name <string>  Project name (default: "my-project")');
    expect(help).toContain("--retries <number>  Retry count (default: 3)");
    expect(help).not.toContain("Force overwrite (default:");
  });

  test("renderCommandHelp does not show default suffix for boolean options", async () => {
    const command = defineCommand({
      description: "Deploy",
      options: [
        { name: "color", type: "boolean", default: true, description: "Colorize output" },
        { name: "verbose", type: "boolean", default: false, description: "Verbose output" },
      ],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["deploy"], "mycli");

    expect(help).not.toContain("(default:");
  });

  test("renderCommandHelp shows default values for arguments", async () => {
    const command = defineCommand({
      description: "Greet someone",
      args: [{ name: "name", type: "string", default: "world", description: "Who to greet" }],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["greet"], "mycli");

    expect(help).toContain('name <string>  Who to greet (default: "world")');
  });

  test("renderCommandHelp shows default for boolean positional arguments", async () => {
    const command = defineCommand({
      description: "Toggle feature",
      args: [{ name: "enabled", type: "boolean", default: true, description: "Enable flag" }],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["toggle"], "mycli");

    expect(help).toContain("enabled  Enable flag (default: true)");
  });

  test("renderCommandHelp escapes quotes in string default values", async () => {
    const command = defineCommand({
      description: "Test escaping",
      options: [{ name: "sep", type: "string", default: 'a"b', description: "Separator" }],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["test"], "mycli");

    expect(help).toContain('(default: "a\\"b")');
  });

  test("renderCommandHelp shows default without extra spaces when description is absent", async () => {
    const command = defineCommand({
      description: "Count items",
      options: [{ name: "count", type: "number", default: 1 }],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["count"], "mycli");

    expect(help).toContain("--count <number>  (default: 1)");
    expect(help).not.toContain("   (default:");
  });

  test("renderCommandHelp shows examples section when examples are provided", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      examples: ["mycli deploy --env production", "mycli deploy --dry-run"],
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["deploy"], "mycli");

    expect(help).toContain("Examples:");
    expect(help).toContain("  $ mycli deploy --env production");
    expect(help).toContain("  $ mycli deploy --dry-run");
  });

  test("renderCommandHelp omits examples section when no examples are provided", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      async run() {},
    });

    const { renderCommandHelp } = await import("../src/manifest/runtime/render-help");
    const help = await renderCommandHelp(command, ["deploy"], "mycli");

    expect(help).not.toContain("Examples:");
  });

  test("renderGroupHelp shows examples section when examples are present on group node", () => {
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

    const help = renderGroupHelp({
      manifest: manifestWithExamples,
      node: groupNode,
      cliName: "mycli",
    });

    expect(help).toContain("Examples:");
    expect(help).toContain("  $ mycli project create my-app");
    expect(help).toContain("  $ mycli project list --all");
  });

  test("renderGroupHelp omits examples section when no examples are present", () => {
    const userGroup = manifest.nodes[5];

    if (userGroup.kind !== "group") {
      throw new Error("Expected user node to be a group");
    }

    const help = renderGroupHelp({ manifest, node: userGroup, cliName: "mycli" });

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
  test("renderUnknownCommandMessage shows canonical suggestions for alias-based matches", () => {
    const route = resolveCommandRoute(
      {
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
      },
      ["depl"],
    );

    if (route.kind !== "unknown") {
      throw new Error("Expected unknown route");
    }

    const message = renderUnknownCommandMessage(route, "mycli");

    expect(message).toContain("Unknown command: mycli depl");
    expect(message).toContain("deploy");
  });
});
