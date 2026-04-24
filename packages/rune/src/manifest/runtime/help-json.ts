import type {
  ArgumentHelpEntry,
  FrameworkOptionHelpEntry,
  UserOptionHelpEntry,
} from "../../core/help-types";
import type { HelpData } from "./build-help-data";
import type { ResolvedHelpData } from "./render-resolved-help";

export const HELP_JSON_SCHEMA_VERSION = 1;

type HelpJsonSchemaVersion = typeof HELP_JSON_SCHEMA_VERSION;

export interface HelpJsonCli {
  readonly name: string;
  readonly version?: string | undefined;
}

export interface HelpJsonCommandSummary {
  readonly name: string;
  readonly path: readonly string[];
  readonly aliases: readonly string[];
  readonly description?: string | undefined;
}

export interface HelpJsonCommandMetadata {
  readonly path: readonly string[];
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly aliases: readonly string[];
  readonly examples: readonly string[];
}

export type HelpJsonOptionSource = "user" | "framework";

export interface HelpJsonOptionBase {
  readonly name: string;
  readonly short?: string | undefined;
  readonly source: HelpJsonOptionSource;
  readonly type: "string" | "number" | "boolean" | "enum" | "schema";
  readonly description?: string | undefined;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly negatable: boolean;
}

export interface HelpJsonPrimitiveOption extends HelpJsonOptionBase {
  readonly type: "string" | "number" | "boolean";
  readonly default?: string | number | boolean | readonly (string | number)[] | undefined;
}

export interface HelpJsonSchemaOption extends HelpJsonOptionBase {
  readonly type: "schema";
  readonly defaultLabel?: string | undefined;
  readonly typeLabel?: string | undefined;
}

export interface HelpJsonEnumOption extends HelpJsonOptionBase {
  readonly type: "enum";
  readonly values: readonly (string | number)[];
  readonly default?: string | number | readonly (string | number)[] | undefined;
}

export type HelpJsonOption = HelpJsonPrimitiveOption | HelpJsonSchemaOption | HelpJsonEnumOption;

export interface HelpJsonArgumentBase {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "enum" | "schema";
  readonly description?: string | undefined;
  readonly required: boolean;
}

export interface HelpJsonScalarArgument extends HelpJsonArgumentBase {
  readonly type: "string" | "number" | "boolean" | "schema";
  readonly default?: string | number | boolean | undefined;
  readonly defaultLabel?: string | undefined;
  readonly typeLabel?: string | undefined;
}

export interface HelpJsonEnumArgument extends HelpJsonArgumentBase {
  readonly type: "enum";
  readonly values: readonly (string | number)[];
  readonly default?: string | number | undefined;
}

export type HelpJsonArgument = HelpJsonScalarArgument | HelpJsonEnumArgument;

export interface CommandHelpJson {
  readonly schemaVersion: HelpJsonSchemaVersion;
  readonly kind: "command";
  readonly cli: HelpJsonCli;
  readonly command: HelpJsonCommandMetadata;
  readonly args: readonly HelpJsonArgument[];
  readonly options: readonly HelpJsonOption[];
  readonly commands: readonly HelpJsonCommandSummary[];
}

export interface GroupHelpJson {
  readonly schemaVersion: HelpJsonSchemaVersion;
  readonly kind: "group";
  readonly cli: HelpJsonCli;
  readonly command: HelpJsonCommandMetadata;
  readonly commands: readonly HelpJsonCommandSummary[];
  readonly options: readonly HelpJsonOption[];
}

export interface UnknownHelpJson {
  readonly schemaVersion: HelpJsonSchemaVersion;
  readonly kind: "unknown";
  readonly cli: HelpJsonCli;
  readonly attemptedPath: readonly string[];
  readonly matchedPath: readonly string[];
  readonly unknownSegment: string;
  readonly availableCommands: readonly HelpJsonCommandSummary[];
  readonly suggestions: readonly HelpJsonCommandSummary[];
}

export type HelpJson = CommandHelpJson | GroupHelpJson | UnknownHelpJson;

function createCli(data: HelpData): HelpJsonCli {
  return {
    name: data.cliName,
    ...(data.cliVersion !== undefined ? { version: data.cliVersion } : {}),
  };
}

function createCommandMetadata(data: {
  readonly pathSegments: readonly string[];
  readonly description?: string | undefined;
  readonly examples?: readonly string[] | undefined;
  readonly aliases: readonly string[];
}): HelpJsonCommandMetadata {
  const name = data.pathSegments.at(-1);

  return {
    path: [...data.pathSegments],
    ...(name !== undefined ? { name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    aliases: [...data.aliases],
    examples: [...(data.examples ?? [])],
  };
}

function createCommandSummary(
  parentPath: readonly string[],
  entry: {
    readonly name: string;
    readonly aliases: readonly string[];
    readonly description?: string | undefined;
  },
): HelpJsonCommandSummary {
  return {
    name: entry.name,
    path: [...parentPath, entry.name],
    aliases: [...entry.aliases],
    ...(entry.description !== undefined ? { description: entry.description } : {}),
  };
}

function mapArgument(entry: ArgumentHelpEntry): HelpJsonArgument {
  if (entry.type === undefined) {
    return {
      name: entry.name,
      type: "schema",
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      required: entry.required,
      ...(entry.defaultLabel !== undefined ? { defaultLabel: entry.defaultLabel } : {}),
      ...(entry.typeLabel !== undefined ? { typeLabel: entry.typeLabel } : {}),
    };
  }

  if (entry.type === "enum") {
    return {
      name: entry.name,
      type: "enum",
      values: [...entry.values],
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      required: entry.required,
      ...(entry.default !== undefined ? { default: entry.default } : {}),
    };
  }

  return {
    name: entry.name,
    type: entry.type,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    required: entry.required,
    ...(entry.default !== undefined ? { default: entry.default } : {}),
  };
}

function mapUserOption(entry: UserOptionHelpEntry): HelpJsonOption {
  const base = {
    name: entry.name,
    ...(entry.short !== undefined ? { short: entry.short } : {}),
    source: "user" as const,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    required: entry.required,
    multiple: entry.multiple === true,
    negatable: entry.negatable,
  };

  if (entry.type === undefined) {
    return {
      ...base,
      type: "schema",
      ...(entry.defaultLabel !== undefined ? { defaultLabel: entry.defaultLabel } : {}),
      ...(entry.typeLabel !== undefined ? { typeLabel: entry.typeLabel } : {}),
    };
  }

  if (entry.type === "enum") {
    return {
      ...base,
      type: "enum",
      values: [...entry.values],
      ...(entry.default !== undefined ? { default: entry.default } : {}),
    };
  }

  return {
    ...base,
    type: entry.type,
    ...(entry.default !== undefined ? { default: entry.default } : {}),
  };
}

function mapFrameworkOption(entry: FrameworkOptionHelpEntry): HelpJsonOption {
  return {
    name: entry.name,
    ...(entry.short !== undefined ? { short: entry.short } : {}),
    source: "framework",
    type: "boolean",
    description: entry.description,
    required: false,
    multiple: false,
    negatable: false,
  };
}

function mapOptions(
  userOptions: readonly UserOptionHelpEntry[],
  frameworkOptions: readonly FrameworkOptionHelpEntry[],
): readonly HelpJsonOption[] {
  return [...userOptions.map(mapUserOption), ...frameworkOptions.map(mapFrameworkOption)];
}

function createSuggestionSummaries(data: Extract<HelpData, { kind: "unknown" }>) {
  const availableByName = new Map(data.availableSubcommands.map((entry) => [entry.name, entry]));

  return data.suggestions.map((name) =>
    createCommandSummary(
      data.matchedPath,
      // Normal routing suggestions come from available subcommands. Keep the
      // fallback so this serializer remains defensive for hand-built help data.
      availableByName.get(name) ?? {
        name,
        aliases: [],
      },
    ),
  );
}

export function toHelpJson(resolved: ResolvedHelpData): HelpJson {
  const { data } = resolved;

  switch (data.kind) {
    case "command":
      return {
        schemaVersion: HELP_JSON_SCHEMA_VERSION,
        kind: "command",
        cli: createCli(data),
        command: createCommandMetadata({ ...data, aliases: resolved.aliases }),
        args: data.arguments.map(mapArgument),
        options: mapOptions(data.options, data.frameworkOptions),
        commands: data.subcommands.map((entry) => createCommandSummary(data.pathSegments, entry)),
      };
    case "group":
      return {
        schemaVersion: HELP_JSON_SCHEMA_VERSION,
        kind: "group",
        cli: createCli(data),
        command: createCommandMetadata({ ...data, aliases: resolved.aliases }),
        commands: data.subcommands.map((entry) => createCommandSummary(data.pathSegments, entry)),
        options: mapOptions([], data.frameworkOptions),
      };
    case "unknown":
      return {
        schemaVersion: HELP_JSON_SCHEMA_VERSION,
        kind: "unknown",
        cli: createCli(data),
        attemptedPath: [...data.attemptedPath],
        matchedPath: [...data.matchedPath],
        unknownSegment: data.unknownSegment,
        availableCommands: data.availableSubcommands.map((entry) =>
          createCommandSummary(data.matchedPath, entry),
        ),
        suggestions: createSuggestionSummaries(data),
      };
  }
}
