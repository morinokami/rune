import {
  isSchemaField,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
} from "@rune-cli/core";

import type {
  CommandManifest,
  CommandManifestGroupNode,
  CommandManifestPath,
} from "../manifest-types";
import type { UnknownCommandRoute } from "./resolve-command-route";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";

export interface CommandHelpSubcommandEntry {
  readonly label: string;
  readonly description?: string | undefined;
}

function formatCommandName(cliName: string, pathSegments: CommandManifestPath): string {
  return pathSegments.length === 0 ? cliName : `${cliName} ${pathSegments.join(" ")}`;
}

function formatSectionEntries(
  entries: readonly { label: string; description?: string | undefined }[],
): string {
  return entries
    .map(({ label, description }) => `  ${label}${description ? `  ${description}` : ""}`)
    .join("\n");
}

function formatExamplesSection(examples: readonly string[]): string {
  return `Examples:\n${examples.map((example) => `  $ ${example}`).join("\n")}`;
}

function formatTypeHint(field: CommandArgField | CommandOptionField): string {
  if (isSchemaField(field)) return "";
  if (field.type === "boolean") return "";
  return ` <${field.type}>`;
}

function formatArgumentLabel(field: CommandArgField): string {
  return `${field.name}${formatTypeHint(field)}`;
}

function formatOptionLabel(field: CommandOptionField): string {
  const longOptionLabel = `--${field.name}${formatTypeHint(field)}`;

  if (!field.short) {
    return longOptionLabel;
  }

  return `-${field.short}, ${longOptionLabel}`;
}

async function isFieldRequired(field: CommandArgField | CommandOptionField): Promise<boolean> {
  if (!isSchemaField(field)) {
    return field.required === true && field.default === undefined;
  }

  const omittedValidation = await field.schema["~standard"].validate(undefined);
  return !("value" in omittedValidation);
}

async function formatUsageArguments(fields: readonly CommandArgField[]): Promise<string> {
  const usageParts: string[] = [];

  for (const field of fields) {
    const required = await isFieldRequired(field);
    usageParts.push(required ? `<${field.name}>` : `[${field.name}]`);
  }

  return usageParts.join(" ");
}

function getOptionUsageSuffix(fields: readonly CommandOptionField[]): string {
  return fields.length === 0 ? "" : "[options]";
}

export interface RenderGroupHelpOptions {
  readonly manifest: CommandManifest;
  readonly node: CommandManifestGroupNode;
  readonly cliName: string;
  readonly version?: string | undefined;
}

// Renders help for a command group using only manifest metadata.
export function renderGroupHelp(options: RenderGroupHelpOptions): string {
  const { manifest, node, cliName, version } = options;
  const nodeMap = createCommandManifestNodeMap(manifest);
  const entries = node.childNames.map((childName) => {
    const childNode =
      nodeMap[commandManifestPathToKey([...node.pathSegments, childName] as CommandManifestPath)];
    const aliasSuffix =
      childNode && childNode.aliases.length > 0 ? ` (${childNode.aliases.join(", ")})` : "";

    return {
      label: `${childName}${aliasSuffix}`,
      description: childNode?.description,
    };
  });
  const commandName = formatCommandName(cliName, node.pathSegments);
  const parts: string[] = [];

  if (node.description) {
    parts.push(node.description);
  }

  parts.push(`Usage: ${commandName} <command>`);

  if (entries.length > 0) {
    parts.push(`Subcommands:\n${formatSectionEntries(entries)}`);
  }

  const isRoot = node.pathSegments.length === 0;
  const optionEntries = [
    { label: "-h, --help", description: "Show help" },
    ...(isRoot && version
      ? [{ label: "-V, --version", description: "Show the version number" }]
      : []),
  ];

  parts.push(`Options:\n${formatSectionEntries(optionEntries)}`);

  if (node.examples && node.examples.length > 0) {
    parts.push(formatExamplesSection(node.examples));
  }

  return `${parts.join("\n\n")}\n`;
}

export interface RenderCommandHelpOptions {
  readonly command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  readonly pathSegments: CommandManifestPath;
  readonly cliName: string;
  readonly subcommands?: readonly CommandHelpSubcommandEntry[] | undefined;
}

// Renders help for a resolved executable command.
export async function renderCommandHelp(
  commandOrOptions:
    | DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>
    | RenderCommandHelpOptions,
  pathSegments?: CommandManifestPath,
  cliName?: string,
): Promise<string> {
  const opts: RenderCommandHelpOptions =
    "command" in commandOrOptions
      ? commandOrOptions
      : { command: commandOrOptions, pathSegments: pathSegments!, cliName: cliName! };

  const { command, subcommands } = opts;
  const usageArguments = await formatUsageArguments(command.args);
  const optionUsageSuffix = getOptionUsageSuffix(command.options);
  const subcommandUsageSuffix = subcommands && subcommands.length > 0 ? "[command]" : "";
  const usageParts = [
    formatCommandName(opts.cliName, opts.pathSegments),
    subcommandUsageSuffix,
    usageArguments,
    optionUsageSuffix,
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  const parts = [`Usage: ${usageParts}`];

  if (command.description) {
    parts.push(`Description:\n  ${command.description}`);
  }

  if (subcommands && subcommands.length > 0) {
    parts.push(`Subcommands:\n${formatSectionEntries(subcommands)}`);
  }

  if (command.args.length > 0) {
    parts.push(
      `Arguments:\n${formatSectionEntries(
        command.args.map((field) => ({
          label: formatArgumentLabel(field),
          description: field.description,
        })),
      )}`,
    );
  }

  const optionEntries = [
    ...command.options.map((field) => ({
      label: formatOptionLabel(field),
      description: field.description,
    })),
    ...(command.json
      ? [{ label: "--json", description: "Output structured results as JSON" }]
      : []),
    {
      label: "-h, --help",
      description: "Show help",
    },
  ];

  parts.push(`Options:\n${formatSectionEntries(optionEntries)}`);

  if (command.examples.length > 0) {
    parts.push(formatExamplesSection(command.examples));
  }

  return `${parts.join("\n\n")}\n`;
}

// Renders a scoped unknown-command message with sibling-only suggestions.
export function renderUnknownCommandMessage(route: UnknownCommandRoute, cliName: string): string {
  const parts = [`Unknown command: ${formatCommandName(cliName, route.attemptedPath)}`];

  if (route.suggestions.length > 0) {
    parts.push(`Did you mean?\n${route.suggestions.map((name) => `  ${name}`).join("\n")}`);
  }

  return `${parts.join("\n\n")}\n`;
}
