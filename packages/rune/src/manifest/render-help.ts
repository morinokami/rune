import {
  isSchemaField,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
} from "@rune-cli/core";
import { pathToFileURL } from "node:url";

import type {
  CommandManifest,
  CommandManifestCommandNode,
  CommandManifestGroupNode,
  CommandManifestPath,
} from "./manifest-types";
import type { ResolveCommandPathResult, UnknownCommandRoute } from "./resolve-command-path";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "./manifest-map";

// Loads only the matched command module so help/execution can inspect its definition.
export async function loadCommandFromModule(
  sourceFilePath: string,
): Promise<DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>> {
  // In `rune dev`, `sourceFilePath` points at source `.ts` command modules.
  const moduleUrl = pathToFileURL(sourceFilePath).href;
  const loadedModule = (await import(moduleUrl)) as {
    default?: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  };

  if (loadedModule.default === undefined) {
    throw new Error(`Command module did not export a default command: ${sourceFilePath}`);
  }

  return loadedModule.default;
}

export type LoadCommandFn = (
  node: CommandManifestCommandNode,
) => Promise<DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>>;

// Default loader that imports the command module from its source file path.
export const defaultLoadCommand: LoadCommandFn = (node) =>
  loadCommandFromModule(node.sourceFilePath);

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
  const parts = [`Usage: ${commandName} <command>`];

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

export interface RenderResolvedHelpOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandPathResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

// Renders group help, leaf help, or unknown-command output from a resolved route.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  if (options.route.kind === "unknown") {
    return renderUnknownCommandMessage(options.route, options.cliName);
  }

  if (options.route.kind === "group") {
    return renderGroupHelp({
      manifest: options.manifest,
      node: options.route.node,
      cliName: options.cliName,
      version: options.version,
    });
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const command = await loadCommand(options.route.node);
  return renderCommandHelp(command, options.route.matchedPath, options.cliName);
}
