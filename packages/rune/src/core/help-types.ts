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

export interface EnumArgumentHelpEntry {
  readonly name: string;
  readonly type: "enum";
  readonly values: readonly (string | number)[];
  readonly description?: string;
  readonly default?: string | number;
  readonly required: boolean;
}

export interface SchemaArgumentHelpEntry {
  readonly name: string;
  readonly type: undefined;
  readonly typeLabel?: string;
  readonly defaultLabel?: string;
  readonly description?: string;
  readonly required: boolean;
}

export type ArgumentHelpEntry =
  | PrimitiveArgumentHelpEntry
  | EnumArgumentHelpEntry
  | SchemaArgumentHelpEntry;

// ---------------------------------------------------------------------------
// Public types – options (discriminated via `type`)
// ---------------------------------------------------------------------------

export interface PrimitiveOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly env?: string;
  readonly type: "string" | "number" | "boolean";
  readonly description?: string;
  /** Array defaults only appear for repeatable string/number options; boolean repeatable options are unsupported. */
  readonly default?: string | number | boolean | readonly (string | number)[];
  readonly required: boolean;
  readonly multiple?: boolean;
  readonly negatable: boolean;
}

export interface EnumOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly env?: string;
  readonly type: "enum";
  readonly values: readonly (string | number)[];
  readonly description?: string;
  /** Array defaults appear only for repeatable enum options. */
  readonly default?: string | number | readonly (string | number)[];
  readonly required: boolean;
  readonly multiple?: boolean;
  readonly negatable: false;
}

export interface SchemaOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly env?: string;
  readonly type: undefined;
  readonly typeLabel?: string;
  readonly defaultLabel?: string;
  readonly description?: string;
  readonly required: boolean;
  readonly multiple?: boolean;
  readonly negatable: false;
}

export interface FrameworkOptionHelpEntry {
  readonly name: string;
  readonly short?: string;
  readonly description: string;
}

export type UserOptionHelpEntry =
  | PrimitiveOptionHelpEntry
  | EnumOptionHelpEntry
  | SchemaOptionHelpEntry;

// ---------------------------------------------------------------------------
// Public types – CommandHelpData
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public types – HelpData (all help render targets)
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
  /** All valid subcommands under the matched node, with descriptions and aliases. */
  readonly availableSubcommands: readonly SubcommandHelpEntry[];
  /** Close matches, sorted by Damerau-Levenshtein distance (max 3). */
  readonly suggestions: readonly string[];
}

export type HelpData = GroupHelpData | CommandHelpData | UnknownCommandHelpData;
