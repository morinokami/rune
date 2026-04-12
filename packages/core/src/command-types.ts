import type { CommandOutput } from "./command-output";
import type { FieldName, FieldValue, IsRequiredField, Simplify } from "./command-type-internals";
import type {
  CommandArgField,
  CommandOptionField,
  NamedField,
  NormalizeFields,
} from "./field-types";
import type { CommandHelpData } from "./help-types";

// Converts declared field arrays into the object shape exposed to command code.
// Pass `TBooleanAlwaysPresent = true` for option fields so that primitive
// boolean options without an explicit default are inferred as required.
export type InferNamedFields<
  TFields extends readonly NamedField[],
  TBooleanAlwaysPresent extends boolean = false,
> = Simplify<
  {
    [TField in TFields[number] as IsRequiredField<TField, TBooleanAlwaysPresent> extends true
      ? FieldName<TField>
      : never]: FieldValue<TField>;
  } & {
    [TField in TFields[number] as IsRequiredField<TField, TBooleanAlwaysPresent> extends true
      ? never
      : FieldName<TField>]?: FieldValue<TField>;
  }
>;

/** Runtime data passed into a command's `run` function. */
export interface CommandContext<TOptions, TArgs> {
  /** Parsed and validated positional argument values keyed by field name. */
  readonly args: TArgs;
  /** Parsed and validated option values keyed by field name. */
  readonly options: TOptions;
  /** Working directory the CLI was invoked from. */
  readonly cwd: string;
  /**
   * Unparsed argv tokens passed to this command, before Rune splits them
   * into `args` and `options`. Useful for forwarding to child processes.
   */
  readonly rawArgs: readonly string[];
  /** Framework-owned output API for producing CLI output. */
  readonly output: CommandOutput;
}

/** The command definition object accepted by {@link defineCommand}. */
export interface DefineCommandInput<
  TArgsFields extends readonly CommandArgField[] | undefined = undefined,
  TOptionsFields extends readonly CommandOptionField[] | undefined = undefined,
  TJson extends boolean = false,
  TRunResult = unknown,
> {
  /** One-line summary shown in `--help` output. */
  readonly description?: string | undefined;
  /**
   * Alternative names for this command. Each alias is an additional path
   * segment that routes to this command. Aliases must follow kebab-case
   * rules (lowercase letters, digits, and internal hyphens).
   */
  readonly aliases?: readonly string[] | undefined;
  /**
   * Usage examples shown in the `Examples:` section of `--help` output.
   * Each entry is a string representing a full command invocation.
   */
  readonly examples?: readonly string[] | undefined;
  /**
   * When `true`, the framework accepts a built-in `--json` flag and the
   * return value of `run()` becomes the structured stdout payload.
   */
  readonly json?: TJson;
  /**
   * Positional arguments declared in the order they appear on the command line.
   * Required arguments must come before optional ones.
   * Argument names must be non-empty and unique within the command. Hyphenated
   * names must start with a letter and use only single internal hyphens.
   *
   * Each entry is either a primitive field (`{ name, type }`) or a schema
   * field (`{ name, schema }`).
   */
  readonly args?: TArgsFields;
  /**
   * Options declared as `--name` flags, with optional single-character short forms.
   * Option names must be unique within the command, start with a letter, and
   * contain only letters, numbers, and internal hyphens.
   *
   * Each entry is either a primitive field (`{ name, type }`) or a schema
   * field (`{ name, schema }`).
   */
  readonly options?: TOptionsFields;
  /**
   * Custom help renderer for this command. When provided, this function is
   * called instead of the default renderer when `--help` is requested.
   * Receives the structured {@link CommandHelpData} for this command.
   */
  readonly help?: ((data: CommandHelpData) => string) | undefined;
  /**
   * The function executed when this command is invoked.
   * Receives a {@link CommandContext} with fully parsed `args` and `options`.
   *
   * When `json` is `true`, the return value is serialized as structured JSON
   * output. Otherwise, the return value is ignored.
   */
  readonly run: (
    ctx: CommandContext<
      InferNamedFields<NormalizeFields<TOptionsFields, CommandOptionField>, true>,
      InferNamedFields<NormalizeFields<TArgsFields, CommandArgField>>
    >,
  ) => TJson extends true ? TRunResult : void | Promise<void>;
}

// The normalized command object returned by `defineCommand`.
export interface DefinedCommand<
  TArgsFields extends readonly CommandArgField[] = readonly [],
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
  TJson extends boolean = boolean,
  TCommandData = TJson extends true ? unknown : undefined,
> {
  readonly description?: string | undefined;
  readonly json: TJson;
  readonly aliases: readonly string[];
  readonly examples: readonly string[];
  readonly args: TArgsFields;
  readonly options: TOptionsFields;
  readonly help?: ((data: CommandHelpData) => string) | undefined;
  readonly run: (
    ctx: CommandContext<InferNamedFields<TOptionsFields, true>, InferNamedFields<TArgsFields>>,
  ) => TJson extends true ? TCommandData | Promise<TCommandData> : void | Promise<void>;
}

// Extracts the inferred options object from a defined command.
export type InferCommandOptions<TCommand> =
  TCommand extends DefinedCommand<any, infer TOptionsFields>
    ? InferNamedFields<TOptionsFields, true>
    : never;

// Extracts the inferred args object from a defined command.
export type InferCommandArgs<TCommand> =
  TCommand extends DefinedCommand<infer TArgsFields, any> ? InferNamedFields<TArgsFields> : never;

// Extracts the inferred JSON payload type from a defined command.
export type InferCommandData<TCommand> = TCommand extends {
  readonly json: true;
  readonly run: (...args: any[]) => infer TRunResult;
}
  ? Awaited<TRunResult>
  : TCommand extends { readonly json: boolean }
    ? undefined
    : never;
