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

export type OptionHelpEntry = UserOptionHelpEntry | FrameworkOptionHelpEntry;

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
