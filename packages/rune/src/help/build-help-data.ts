import type { DefinedCommand } from "../core/command-types";
import type { CommandArgField, CommandOptionField } from "../core/field-types";
import type {
  ArgumentHelpEntry,
  CommandHelpData,
  EnumArgumentHelpEntry,
  EnumOptionHelpEntry,
  FrameworkOptionHelpEntry,
  GroupHelpData,
  PrimitiveArgumentHelpEntry,
  PrimitiveOptionHelpEntry,
  SubcommandHelpEntry,
  UnknownCommandHelpData,
  UserOptionHelpEntry,
} from "../core/help-types";
import type {
  CommandManifest,
  CommandManifestGroupNode,
  CommandManifestPath,
} from "../manifest/manifest-types";
import type { UnknownCommandRoute } from "../routing/resolve-command-route";

import { isEnumField } from "../core/enum-field";
import { isSchemaField } from "../core/schema-field";
import { resolveSubcommandHelpEntries } from "./resolve-subcommand-help-entries";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BuildGroupHelpDataOptions {
  readonly manifest: CommandManifest;
  readonly node: CommandManifestGroupNode;
  readonly cliName: string;
  readonly version?: string;
}

export interface BuildCommandHelpDataOptions {
  readonly command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  readonly pathSegments: CommandManifestPath;
  readonly cliName: string;
  readonly version?: string;
  readonly subcommands?: readonly SubcommandHelpEntry[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildGroupHelpData(options: BuildGroupHelpDataOptions): GroupHelpData {
  const { manifest, node, cliName, version } = options;
  const subcommands = resolveSubcommandHelpEntries(manifest, node.pathSegments, node.childNames);
  const isRoot = node.pathSegments.length === 0;

  const frameworkOptions: FrameworkOptionHelpEntry[] = [
    { name: "help", short: "h", description: "Show help" },
    ...(isRoot && version
      ? [
          {
            name: "version",
            short: "V",
            description: "Show the version number",
          } satisfies FrameworkOptionHelpEntry,
        ]
      : []),
  ];

  return {
    kind: "group",
    cliName,
    pathSegments: [...node.pathSegments],
    description: node.description,
    cliVersion: version,
    subcommands,
    frameworkOptions,
    examples: node.examples ? [...node.examples] : [],
  };
}

export async function buildCommandHelpData(
  options: BuildCommandHelpDataOptions,
): Promise<CommandHelpData> {
  const { command, pathSegments, cliName, version, subcommands } = options;

  const argumentEntries: ArgumentHelpEntry[] = [];

  for (const field of command.args) {
    const required = await resolveFieldRequired(field);

    if (isSchemaField(field)) {
      argumentEntries.push({
        name: field.name,
        type: undefined,
        description: field.description,
        required,
        ...(field.typeLabel !== undefined ? { typeLabel: field.typeLabel } : {}),
        ...(field.defaultLabel !== undefined ? { defaultLabel: field.defaultLabel } : {}),
      });
    } else if (isEnumField(field)) {
      const entry: EnumArgumentHelpEntry = {
        name: field.name,
        type: "enum",
        values: [...field.values],
        description: field.description,
        required,
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
      argumentEntries.push(entry);
    } else {
      const entry: PrimitiveArgumentHelpEntry = {
        name: field.name,
        type: field.type,
        description: field.description,
        required,
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
      argumentEntries.push(entry);
    }
  }

  const optionEntries: UserOptionHelpEntry[] = [];

  for (const field of command.options) {
    const required = await resolveFieldRequired(field);

    if (isSchemaField(field)) {
      optionEntries.push({
        name: field.name,
        short: field.short,
        type: undefined,
        description: field.description,
        required,
        multiple: isMultipleOption(field),
        negatable: false as const,
        ...(field.typeLabel !== undefined ? { typeLabel: field.typeLabel } : {}),
        ...(field.defaultLabel !== undefined ? { defaultLabel: field.defaultLabel } : {}),
      });
    } else if (isEnumField(field)) {
      const entry: EnumOptionHelpEntry = {
        name: field.name,
        short: field.short,
        type: "enum",
        values: [...field.values],
        description: field.description,
        required,
        multiple: isMultipleOption(field),
        negatable: false as const,
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
      optionEntries.push(entry);
    } else {
      const entry: PrimitiveOptionHelpEntry = {
        name: field.name,
        short: field.short,
        type: field.type,
        description: field.description,
        required,
        multiple: isMultipleOption(field),
        negatable: field.type === "boolean" && field.default === true,
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
      optionEntries.push(entry);
    }
  }

  const frameworkOptions: FrameworkOptionHelpEntry[] = [
    ...(command.json ? [{ name: "json", description: "Output structured results as JSON" }] : []),
    { name: "help", short: "h", description: "Show help" },
  ];

  return {
    kind: "command",
    cliName,
    pathSegments: [...pathSegments],
    cliVersion: version,
    description: command.description,
    subcommands: subcommands ?? [],
    arguments: argumentEntries,
    options: optionEntries,
    frameworkOptions,
    examples: [...command.examples],
  };
}

export function buildUnknownCommandHelpData(
  route: UnknownCommandRoute,
  cliName: string,
  manifest: CommandManifest,
  version?: string,
): UnknownCommandHelpData {
  const availableSubcommands = resolveSubcommandHelpEntries(
    manifest,
    route.matchedPath as CommandManifestPath,
    route.availableChildNames,
  );

  return {
    kind: "unknown",
    cliName,
    cliVersion: version,
    attemptedPath: [...route.attemptedPath],
    matchedPath: [...route.matchedPath],
    unknownSegment: route.unknownSegment,
    availableSubcommands,
    suggestions: [...route.suggestions],
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function resolveFieldRequired(field: CommandArgField | CommandOptionField): Promise<boolean> {
  if (isSchemaField(field)) {
    const omittedValidation = await field.schema["~standard"].validate(undefined);
    return !("value" in omittedValidation);
  }

  return field.required === true && field.default === undefined;
}

function isMultipleOption(field: CommandOptionField): boolean {
  return "multiple" in field && field.multiple === true;
}
