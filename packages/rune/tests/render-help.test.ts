import type { CommandHelpData } from "@rune-cli/core";

import { assert, describe, expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
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
  test("unknown command help shows canonical suggestions for alias-based matches", async () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["dep"],
        description: "Deploy the app",
      }),
    ]);

    const route = resolveCommandRoute(aliasManifest, ["depl"]);

    const message = await renderResolvedHelp({
      manifest: aliasManifest,
      route,
      cliName: "mycli",
    });

    expect(message).toContain("Unknown command: mycli depl");
    expect(message).toContain("deploy");
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
    assert(receivedData);
    expect(receivedData.kind).toBe("command");
    expect(receivedData.cliName).toBe("mycli");
    expect(receivedData.arguments).toHaveLength(1);
    expect(receivedData.options).toHaveLength(1);
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
  test("command.help takes priority over config.help", async () => {
    const command = defineCommand({
      description: "Deploy",
      help() {
        return "command-level\n";
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

    expect(output).toBe("command-level\n");
  });

  test("config.help is used for group help", async () => {
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

    expect(output).toContain("Usage: mycli hello");
  });
});
