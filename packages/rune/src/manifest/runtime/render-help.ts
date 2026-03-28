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
import type { UnknownCommandRoute } from "./resolve-command-path";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";

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

function formatTypeHint(field: CommandArgField | CommandOptionField): string {
  return isSchemaField(field) ? "" : ` <${field.type}>`;
}

function formatArgumentLabel(field: CommandArgField): string {
  return `${field.name}${formatTypeHint(field)}`;
}

function formatOptionLabel(field: CommandOptionField): string {
  const longOptionLabel = `--${field.name}${formatTypeHint(field)}`;

  if (!field.alias) {
    return longOptionLabel;
  }

  return `-${field.alias}, ${longOptionLabel}`;
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

    return {
      label: childName,
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

  return `${parts.join("\n\n")}\n`;
}

// Renders help for a resolved executable command.
export async function renderCommandHelp(
  command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  pathSegments: CommandManifestPath,
  cliName: string,
): Promise<string> {
  const usageArguments = await formatUsageArguments(command.args);
  const optionUsageSuffix = getOptionUsageSuffix(command.options);
  const usageParts = [formatCommandName(cliName, pathSegments), usageArguments, optionUsageSuffix]
    .filter((part) => part.length > 0)
    .join(" ");

  const parts = [`Usage: ${usageParts}`];

  if (command.description) {
    parts.push(`Description:\n  ${command.description}`);
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
    {
      label: "-h, --help",
      description: "Show help",
    },
  ];

  parts.push(`Options:\n${formatSectionEntries(optionEntries)}`);

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
