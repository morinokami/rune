import { describe, expect, test } from "vite-plus/test";

import { defineCommand } from "../../src";
import { buildCommandHelpData } from "../../src/manifest/runtime/build-help-data";
import { renderDefaultHelp } from "../../src/manifest/runtime/render-default-help";

async function renderCommandHelpText(options: {
  readonly command: Parameters<typeof buildCommandHelpData>[0]["command"];
  readonly pathSegments: Parameters<typeof buildCommandHelpData>[0]["pathSegments"];
  readonly cliName: string;
  readonly version?: string;
}): Promise<string> {
  return renderDefaultHelp(await buildCommandHelpData(options));
}

describe("command help", () => {
  test("command help includes usage, description, args, and options", async () => {
    const command = defineCommand({
      description: "Create a project",
      args: [
        {
          name: "id",
          type: "string",
          required: true,
          description: "Project identifier",
        },
      ],
      options: [
        {
          name: "name",
          type: "string",
          required: true,
          description: "Project name",
        },
        {
          name: "force",
          type: "boolean",
          short: "f",
          description: "Overwrite existing state",
        },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["project", "create"],
      cliName: "mycli",
    });
    const lines = help.split("\n");

    expect(help).toContain("Usage: mycli project create <id> [options]");
    expect(help).toContain("Create a project");
    expect(help).not.toContain("Description:");
    expect(lines[0]).toBe("Create a project");
    expect(lines[2]).toBe("Usage: mycli project create <id> [options]");
    expect(help).toContain("id <string>  Project identifier");
    expect(help).toContain("--name <string>  Project name");
    expect(help).toContain("-f, --force  Overwrite existing state");
    expect(help).toContain("-h, --help  Show help");
  });

  test("command help shows --no-flag for boolean options with default true", async () => {
    const command = defineCommand({
      description: "Deploy the application",
      options: [
        {
          name: "color",
          type: "boolean",
          default: true,
          description: "Colorize output",
        },
        {
          name: "force",
          type: "boolean",
          short: "f",
          description: "Force deploy",
        },
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
        {
          name: "name",
          type: "string",
          default: "my-project",
          description: "Project name",
        },
        {
          name: "retries",
          type: "number",
          default: 3,
          description: "Retry count",
        },
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
        {
          name: "color",
          type: "boolean",
          default: true,
          description: "Colorize output",
        },
        {
          name: "verbose",
          type: "boolean",
          default: false,
          description: "Verbose output",
        },
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
      args: [
        {
          name: "name",
          type: "string",
          default: "world",
          description: "Who to greet",
        },
      ],
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
      args: [
        {
          name: "enabled",
          type: "boolean",
          default: true,
          description: "Enable flag",
        },
      ],
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
      options: [
        {
          name: "sep",
          type: "string",
          default: 'a"b',
          description: "Separator",
        },
      ],
      async run() {},
    });

    const help = await renderCommandHelpText({
      command,
      pathSegments: ["test"],
      cliName: "mycli",
    });

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
});
