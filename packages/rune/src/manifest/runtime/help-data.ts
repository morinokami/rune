import {
  isSchemaField,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
} from "@rune-cli/core";

import type {
  CommandManifest,
  CommandManifestGroupNode,
  CommandManifestNode,
  CommandManifestPath,
} from "../manifest-types";
import type { UnknownCommandRoute } from "./resolve-command-route";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";

// ---------------------------------------------------------------------------
// Public types – subcommands
// ---------------------------------------------------------------------------

export interface SubcommandHelpEntry {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Public types – arguments (discriminated via `type`)
// ---------------------------------------------------------------------------

export interface PrimitiveArgumentHelpEntry {
  readonly name: string;
  readonly type: "string" | "number" | "boolean";
  readonly description?: string;
  readonly default?: string | number | boolean;
  readonly required: boolean;
}

export interface SchemaArgumentHelpEntry {
  readonly name: string;
  readonly type: undefined;
  readonly description?: string;
  readonly required: boolean;
}

export type ArgumentHelpEntry = PrimitiveArgumentHelpEntry | SchemaArgumentHelpEntry;

// ---------------------------------------------------------------------------
// Public types – options (discriminated via `type` / `framework`)
// ---------------------------------------------------------------------------

export interface PrimitiveOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly type: "string" | "number" | "boolean";
  readonly description?: string;
  readonly default?: string | number | boolean;
  readonly required: boolean;
  readonly negatable: boolean;
}

export interface SchemaOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly type: undefined;
  readonly description?: string;
  readonly required: boolean;
  readonly negatable: false;
}

export interface FrameworkOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly description: string;
}

export type UserOptionHelpEntry = PrimitiveOptionHelpEntry | SchemaOptionHelpEntry;

export type OptionHelpEntry = UserOptionHelpEntry | FrameworkOptionHelpEntry;

// ---------------------------------------------------------------------------
// Public types – HelpData
// ---------------------------------------------------------------------------

export interface GroupHelpData {
  readonly kind: "group";
  /** CLI binary name (e.g. `"mycli"`). */
  readonly cliName: string;
  /** Command path segments (e.g. `["deploy"]`). Empty for the root group. */
  readonly pathSegments: readonly string[];
  /** CLI version string (e.g. `"1.0.0"`), if known. */
  readonly cliVersion?: string;
  /** One-line description of the group. */
  readonly description?: string;
  /** Direct subcommands, in manifest-defined order. */
  readonly subcommands: readonly SubcommandHelpEntry[];
  /** Framework-managed options (e.g. `--help`, `--version`). */
  readonly frameworkOptions: readonly FrameworkOptionHelpEntry[];
  /** Usage examples. */
  readonly examples: readonly string[];
}

export interface CommandHelpData {
  readonly kind: "command";
  /** CLI binary name (e.g. `"mycli"`). */
  readonly cliName: string;
  /** Command path segments (e.g. `["deploy", "create"]`). */
  readonly pathSegments: readonly string[];
  /** CLI version string (e.g. `"1.0.0"`), if known. */
  readonly cliVersion?: string;
  /** One-line description of the command. */
  readonly description?: string;
  /** Direct subcommands, in manifest-defined order. */
  readonly subcommands: readonly SubcommandHelpEntry[];
  /** Positional arguments, in definition order. */
  readonly arguments: readonly ArgumentHelpEntry[];
  /** User-defined options, in definition order. */
  readonly options: readonly UserOptionHelpEntry[];
  /** Framework-managed options (e.g. `--help`, `--json`). */
  readonly frameworkOptions: readonly FrameworkOptionHelpEntry[];
  /** Usage examples. */
  readonly examples: readonly string[];
}

export interface UnknownCommandHelpData {
  readonly kind: "unknown";
  /** CLI binary name (e.g. `"mycli"`). */
  readonly cliName: string;
  /** CLI version string (e.g. `"1.0.0"`), if known. */
  readonly cliVersion?: string;
  /** Full command path including the unrecognized segment (e.g. `["deploy", "craete"]`). */
  readonly attemptedPath: readonly string[];
  /** Last successfully resolved path before the failure (e.g. `["deploy"]`). */
  readonly matchedPath: readonly string[];
  /** The specific token that did not match any child command. */
  readonly unknownSegment: string;
  /** Names of all valid subcommands under the matched node. */
  readonly availableSubcommandNames: readonly string[];
  /** Close matches, sorted by Damerau-Levenshtein distance (max 3). */
  readonly suggestions: readonly string[];
}

export type HelpData = GroupHelpData | CommandHelpData | UnknownCommandHelpData;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveFieldRequired(field: CommandArgField | CommandOptionField): Promise<boolean> {
  if (!isSchemaField(field)) {
    return field.required === true && field.default === undefined;
  }

  const omittedValidation = await field.schema["~standard"].validate(undefined);
  return !("value" in omittedValidation);
}

function resolveSubcommandHelpEntries(
  manifest: CommandManifest,
  parentNode:
    | CommandManifestGroupNode
    | { readonly pathSegments: CommandManifestPath; readonly childNames: readonly string[] },
): readonly SubcommandHelpEntry[] {
  const nodeMap = createCommandManifestNodeMap(manifest);

  return parentNode.childNames.map((childName) => {
    const childNode: CommandManifestNode | undefined =
      nodeMap[
        commandManifestPathToKey([...parentNode.pathSegments, childName] as CommandManifestPath)
      ];

    return {
      name: childName,
      aliases: childNode ? [...childNode.aliases] : [],
      description: childNode?.description,
    };
  });
}

// ---------------------------------------------------------------------------
// Builder options
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
// Builder functions
// ---------------------------------------------------------------------------

export function buildGroupHelpData(options: BuildGroupHelpDataOptions): GroupHelpData {
  const { manifest, node, cliName, version } = options;
  const subcommands = resolveSubcommandHelpEntries(manifest, node);
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
      });
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
        negatable: false as const,
      });
    } else {
      const entry: PrimitiveOptionHelpEntry = {
        name: field.name,
        short: field.short,
        type: field.type,
        description: field.description,
        required,
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
  version?: string,
): UnknownCommandHelpData {
  return {
    kind: "unknown",
    cliName,
    cliVersion: version,
    attemptedPath: [...route.attemptedPath],
    matchedPath: [...route.matchedPath],
    unknownSegment: route.unknownSegment,
    // Names only for now. If custom renderers need descriptions/aliases,
    // this could be upgraded to SubcommandHelpEntry[] (requires manifest access).
    availableSubcommandNames: [...route.availableChildNames],
    suggestions: [...route.suggestions],
  };
}
