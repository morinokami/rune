import { describe, expect, test } from "vite-plus/test";

import type {
  CommandHelpData,
  GroupHelpData,
  UnknownCommandHelpData,
} from "../../src/core/help-types";

import { renderDefaultHelp } from "../../src/help/render-default-help";

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
        {
          name: "id",
          type: "string",
          description: "Project identifier",
          required: true,
        },
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
    const lines = help.split("\n");

    expect(help).toContain("Usage: mycli create [options] <id>");
    expect(help).toContain("Create a project");
    expect(help).not.toContain("Description:");
    expect(lines[0]).toBe("Create a project");
    expect(lines[2]).toBe("Usage: mycli create [options] <id>");
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
      arguments: [
        {
          name: "target",
          type: undefined,
          description: "Build target",
          required: true,
        },
      ],
      options: [
        {
          name: "mode",
          type: undefined,
          description: "Build mode",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Usage: mycli run [options] <target>");
    expect(help).toContain("  target  Build target");
    expect(help).toContain("  --mode  Build mode");
  });

  test("renders enum fields with the allowed values type hint", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["build"],
      subcommands: [],
      arguments: [
        {
          name: "target",
          type: "enum",
          values: ["web", "node"],
          description: "Build target",
          required: true,
        },
      ],
      options: [
        {
          name: "mode",
          type: "enum",
          values: ["dev", "prod"],
          default: "dev",
          description: "Build mode",
          required: true,
          negatable: false,
        },
        {
          name: "level",
          type: "enum",
          values: ["low", 1, "high"],
          description: "Level",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("  target <web|node>  Build target");
    expect(help).toContain('  --mode <dev|prod>  Build mode (default: "dev")');
    expect(help).toContain("  --level <low|1|high>  Level");
  });

  test("renders typeLabel and defaultLabel for schema fields", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["serve"],
      subcommands: [],
      arguments: [
        {
          name: "id",
          type: undefined,
          typeLabel: "uuid",
          description: "Resource id",
          required: true,
        },
      ],
      options: [
        {
          name: "port",
          type: undefined,
          typeLabel: "number",
          defaultLabel: "3000",
          description: "Port to listen on",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("  id <uuid>  Resource id");
    expect(help).toContain("  --port <number>  Port to listen on (default: 3000)");
  });

  test("renders array defaults for repeated options", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["search"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "tag",
          type: "string",
          default: ["alpha", "beta"],
          description: "Filter tag",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain('  --tag <string>  Filter tag (default: ["alpha", "beta"])');
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

  test("renders boolean option with default:true as --no-flag alongside --flag", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["deploy"],
      description: "Deploy the application",
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "color",
          type: "boolean",
          default: true,
          description: "Colorize output",
          required: false,
          negatable: true,
        },
        {
          name: "force",
          short: "f",
          type: "boolean",
          description: "Force deploy",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("--color, --no-color  Colorize output");
    expect(help).not.toContain("--no-force");
    expect(help).toContain("-f, --force  Force deploy");
  });

  test("renders default for number options", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["retry"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "retries",
          type: "number",
          default: 3,
          description: "Retry count",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("--retries <number>  Retry count (default: 3)");
  });

  test("omits default suffix for boolean options regardless of value", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["deploy"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "color",
          type: "boolean",
          default: true,
          description: "Colorize output",
          required: false,
          negatable: true,
        },
        {
          name: "verbose",
          type: "boolean",
          default: false,
          description: "Verbose output",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).not.toContain("(default:");
  });

  test("renders default for positional string argument", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["greet"],
      subcommands: [],
      arguments: [
        {
          name: "name",
          type: "string",
          default: "world",
          description: "Who to greet",
          required: false,
        },
      ],
      options: [],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain('name <string>  Who to greet (default: "world")');
  });

  test("renders default for positional boolean argument (unlike boolean options)", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["toggle"],
      subcommands: [],
      arguments: [
        {
          name: "enabled",
          type: "boolean",
          default: true,
          description: "Enable flag",
          required: false,
        },
      ],
      options: [],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("enabled  Enable flag (default: true)");
  });

  test("escapes quotes in string default values", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["test"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "sep",
          type: "string",
          default: 'a"b',
          description: "Separator",
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain('(default: "a\\"b")');
  });

  test("renders default without extra spaces when description is absent", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["count"],
      subcommands: [],
      arguments: [],
      options: [
        {
          name: "count",
          type: "number",
          default: 1,
          required: false,
          negatable: false,
        },
      ],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("--count <number>  (default: 1)");
    expect(help).not.toContain("   (default:");
  });

  test("renders multiple examples in examples section", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["deploy"],
      description: "Deploy the application",
      subcommands: [],
      arguments: [],
      options: [],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: ["mycli deploy --env production", "mycli deploy --dry-run"],
    };

    const help = renderDefaultHelp(data);

    expect(help).toContain("Examples:");
    expect(help).toContain("  $ mycli deploy --env production");
    expect(help).toContain("  $ mycli deploy --dry-run");
  });

  test("omits examples section when no examples are provided", () => {
    const data: CommandHelpData = {
      kind: "command",
      cliName: "mycli",
      pathSegments: ["deploy"],
      description: "Deploy the application",
      subcommands: [],
      arguments: [],
      options: [],
      frameworkOptions: [{ name: "help", short: "h", description: "Show help" }],
      examples: [],
    };

    const help = renderDefaultHelp(data);

    expect(help).not.toContain("Examples:");
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
