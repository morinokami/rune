import type {
  ArgumentHelpEntry,
  CommandHelpData,
  EnumOptionHelpEntry,
  FrameworkOptionHelpEntry,
  PrimitiveOptionHelpEntry,
  SchemaOptionHelpEntry,
  SubcommandHelpEntry,
} from "@rune-cli/core";

import type { GroupHelpData, HelpData, UnknownCommandHelpData } from "./build-help-data";

function formatEnumValuesTypeHint(values: readonly (string | number)[]): string {
  return `<${values.join("|")}>`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCommandName(cliName: string, pathSegments: readonly string[]): string {
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

function formatSubcommandLabel(entry: SubcommandHelpEntry): string {
  const aliasSuffix = entry.aliases.length > 0 ? ` (${entry.aliases.join(", ")})` : "";
  return `${entry.name}${aliasSuffix}`;
}

function formatArgumentLabel(entry: ArgumentHelpEntry): string {
  if (entry.type === undefined) {
    return entry.typeLabel ? `${entry.name} <${entry.typeLabel}>` : entry.name;
  }
  if (entry.type === "boolean") return entry.name;
  if (entry.type === "enum") return `${entry.name} ${formatEnumValuesTypeHint(entry.values)}`;
  return `${entry.name} <${entry.type}>`;
}

function formatArgumentDefaultSuffix(entry: ArgumentHelpEntry): string {
  if (entry.type === undefined) {
    return entry.defaultLabel ? `(default: ${entry.defaultLabel})` : "";
  }
  if (!("default" in entry) || entry.default === undefined) return "";

  const formatted =
    typeof entry.default === "string" ? JSON.stringify(entry.default) : String(entry.default);

  return `(default: ${formatted})`;
}

function joinDescription(description: string | undefined, suffix: string): string | undefined {
  if (description && suffix) return `${description} ${suffix}`;
  if (description) return description;
  if (suffix) return suffix;

  return undefined;
}

function formatUsageArguments(entries: readonly ArgumentHelpEntry[]): string {
  return entries.map((entry) => (entry.required ? `<${entry.name}>` : `[${entry.name}]`)).join(" ");
}

function formatUserOptionLabel(
  entry: PrimitiveOptionHelpEntry | EnumOptionHelpEntry | SchemaOptionHelpEntry,
): string {
  const typeHint =
    entry.type === undefined
      ? entry.typeLabel
        ? ` <${entry.typeLabel}>`
        : ""
      : entry.type === "enum"
        ? ` ${formatEnumValuesTypeHint(entry.values)}`
        : entry.type !== "boolean"
          ? ` <${entry.type}>`
          : "";
  const negationSuffix = entry.negatable ? `, --no-${entry.name}` : "";
  const longLabel = `--${entry.name}${typeHint}${negationSuffix}`;

  return entry.short ? `-${entry.short}, ${longLabel}` : longLabel;
}

function formatUserOptionDefaultSuffix(
  entry: PrimitiveOptionHelpEntry | EnumOptionHelpEntry | SchemaOptionHelpEntry,
): string {
  if (entry.type === undefined) {
    return entry.defaultLabel ? `(default: ${entry.defaultLabel})` : "";
  }
  if (!("default" in entry) || entry.default === undefined) return "";
  if (entry.type === "boolean") return "";

  const formatted =
    typeof entry.default === "string" ? JSON.stringify(entry.default) : String(entry.default);

  return `(default: ${formatted})`;
}

// ---------------------------------------------------------------------------
// Internal renderers
// ---------------------------------------------------------------------------

function renderGroupHelpFromData(data: GroupHelpData): string {
  const parts: string[] = [];

  if (data.description) {
    parts.push(data.description);
  }

  const commandName = formatCommandName(data.cliName, data.pathSegments);
  parts.push(`Usage: ${commandName} <command>`);

  if (data.subcommands.length > 0) {
    parts.push(
      `Subcommands:\n${formatSectionEntries(
        data.subcommands.map((entry) => ({
          label: formatSubcommandLabel(entry),
          description: entry.description,
        })),
      )}`,
    );
  }

  const optionEntries = data.frameworkOptions.map((entry) => ({
    label: formatFrameworkOptionLabel(entry),
    description: entry.description,
  }));

  parts.push(`Options:\n${formatSectionEntries(optionEntries)}`);

  if (data.examples.length > 0) {
    parts.push(formatExamplesSection(data.examples));
  }

  return `${parts.join("\n\n")}\n`;
}

function formatFrameworkOptionLabel(entry: FrameworkOptionHelpEntry): string {
  return entry.short ? `-${entry.short}, --${entry.name}` : `--${entry.name}`;
}

function renderCommandHelpFromData(data: CommandHelpData): string {
  const usageArguments = formatUsageArguments(data.arguments);
  const optionUsageSuffix = data.options.length > 0 ? "[options]" : "";
  const subcommandUsageSuffix = data.subcommands.length > 0 ? "[command]" : "";
  const commandName = formatCommandName(data.cliName, data.pathSegments);
  const usageParts = [commandName, subcommandUsageSuffix, usageArguments, optionUsageSuffix]
    .filter((part) => part.length > 0)
    .join(" ");

  const parts = [`Usage: ${usageParts}`];

  if (data.description) {
    parts.push(`Description:\n  ${data.description}`);
  }

  if (data.subcommands.length > 0) {
    parts.push(
      `Subcommands:\n${formatSectionEntries(
        data.subcommands.map((entry) => ({
          label: formatSubcommandLabel(entry),
          description: entry.description,
        })),
      )}`,
    );
  }

  if (data.arguments.length > 0) {
    parts.push(
      `Arguments:\n${formatSectionEntries(
        data.arguments.map((entry) => ({
          label: formatArgumentLabel(entry),
          description: joinDescription(entry.description, formatArgumentDefaultSuffix(entry)),
        })),
      )}`,
    );
  }

  const optionEntries = [
    ...data.options.map((entry) => ({
      label: formatUserOptionLabel(entry),
      description: joinDescription(entry.description, formatUserOptionDefaultSuffix(entry)),
    })),
    ...data.frameworkOptions.map((entry) => ({
      label: formatFrameworkOptionLabel(entry),
      description: entry.description,
    })),
  ];

  parts.push(`Options:\n${formatSectionEntries(optionEntries)}`);

  if (data.examples.length > 0) {
    parts.push(formatExamplesSection(data.examples));
  }

  return `${parts.join("\n\n")}\n`;
}

function renderUnknownHelpFromData(data: UnknownCommandHelpData): string {
  const commandName = formatCommandName(data.cliName, data.attemptedPath);
  const parts = [`Unknown command: ${commandName}`];

  if (data.suggestions.length > 0) {
    parts.push(`Did you mean?\n${data.suggestions.map((name) => `  ${name}`).join("\n")}`);
  }

  return `${parts.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderDefaultHelp(data: HelpData): string {
  switch (data.kind) {
    case "group":
      return renderGroupHelpFromData(data);
    case "command":
      return renderCommandHelpFromData(data);
    case "unknown":
      return renderUnknownHelpFromData(data);
  }
}
