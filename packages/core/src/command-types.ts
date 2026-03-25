import type { StandardSchemaV1 } from "@standard-schema/spec";

// Primitive field kinds supported by Rune without an external schema.
export type PrimitiveFieldType = "string" | "number" | "boolean";

// Maps a primitive field kind to the runtime value it produces.
export type PrimitiveFieldValue<TType extends PrimitiveFieldType> = TType extends "string"
  ? string
  : TType extends "number"
    ? number
    : boolean;

interface NamedField<TName extends string = string> {
  /**
   * Identifier used as the key in `ctx.args` / `ctx.options`.
   *
   * For args, any non-empty name is allowed.
   * For options, names must start with a letter and may contain only letters,
   * numbers, and internal hyphens (for example: `dry-run`, `dryRun`, `v2`).
   */
  readonly name: TName;
  /** One-line help text shown in `--help` output. */
  readonly description?: string | undefined;
}

interface PrimitiveFieldBase<
  TName extends string,
  TType extends PrimitiveFieldType,
> extends NamedField<TName> {
  /** Primitive type that Rune parses the raw CLI token into (`"string"`, `"number"`, or `"boolean"`). */
  readonly type: TType;
  /**
   * When `true`, the field must be provided by the user.
   * Omitted or `false` makes the field optional (absent fields are `undefined` in `ctx`).
   */
  readonly required?: boolean | undefined;
  /** Value used when the user does not provide this field. Makes the field always present in `ctx`. */
  readonly default?: PrimitiveFieldValue<TType> | undefined;
  readonly schema?: never;
}

interface SchemaFieldBase<
  TName extends string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends NamedField<TName> {
  /**
   * A Standard Schema object (e.g. `z.string()`, `v.number()`) used to
   * validate and transform the raw CLI token. Required/optional and default
   * semantics are derived from the schema itself.
   */
  readonly schema: TSchema;
  readonly type?: never;
  readonly required?: never;
  readonly default?: never;
}

// A positional argument backed by Rune's primitive field types.
export interface PrimitiveArgField<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> extends PrimitiveFieldBase<TName, TType> {
  readonly alias?: never;
  readonly flag?: never;
}

// A positional argument backed by a Standard Schema object.
export interface SchemaArgField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaFieldBase<TName, TSchema> {
  readonly alias?: never;
  readonly flag?: never;
}

// An option flag backed by Rune's primitive field types.
export interface PrimitiveOptionField<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> extends PrimitiveFieldBase<TName, TType> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly alias?: string | undefined;
  readonly flag?: never;
}

// An option backed by a Standard Schema object.
export interface SchemaOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaFieldBase<TName, TSchema> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly alias?: string | undefined;
  /**
   * When `true`, the option is parsed as a boolean flag (no value expected).
   * The schema receives `true` when the flag is present, `undefined` when absent.
   */
  readonly flag?: true | undefined;
}

// Any supported positional argument field.
export type CommandArgField = PrimitiveArgField | SchemaArgField;

// Any supported option field.
export type CommandOptionField = PrimitiveOptionField | SchemaOptionField;

// Replaces omitted field arrays with a stable empty tuple type.
export type NormalizeFields<
  TFields extends readonly TField[] | undefined,
  TField,
> = TFields extends readonly TField[] ? TFields : readonly [];

// Pulls the declared field name out of a field definition.
type FieldName<TField> = TField extends { readonly name: infer TName extends string }
  ? TName
  : never;

// Reads the output type produced by a Standard Schema field.
type InferSchemaOutput<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : never;

// Reads the input type accepted by a Standard Schema field.
type InferSchemaInput<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferInput<TSchema>
  : never;

// Treats schema outputs including `undefined` as optional properties.
type IsOptionalSchemaOutput<TValue> = undefined extends TValue ? true : false;

// Computes the value type produced by a field after parsing or validation.
type FieldValue<TField> = TField extends { readonly schema: infer TSchema }
  ? Exclude<InferSchemaOutput<TSchema>, undefined>
  : TField extends { readonly type: infer TType extends PrimitiveFieldType }
    ? PrimitiveFieldValue<TType>
    : never;

// Computes the input value shape accepted before parsing or default application.
type FieldInputValue<TField> = TField extends { readonly schema: infer TSchema }
  ? InferSchemaInput<TSchema>
  : TField extends { readonly type: infer TType extends PrimitiveFieldType }
    ? PrimitiveFieldValue<TType>
    : never;

// Detects whether a field declares an actual default value.
type HasDefaultValue<TField> = TField extends { readonly default: infer TDefault }
  ? [TDefault] extends [undefined]
    ? false
    : true
  : false;

// Decides whether a field becomes required on `ctx.args` / `ctx.options`.
type IsRequiredField<TField> = TField extends { readonly schema: infer TSchema }
  ? IsOptionalSchemaOutput<InferSchemaOutput<TSchema>> extends true
    ? false
    : true
  : HasDefaultValue<TField> extends true
    ? true
    : TField extends { readonly required: true }
      ? true
      : false;

// Determines whether a positional arg field can be omitted by the user.
// Schema fields are checked via InferSchemaInput: if the schema accepts
// undefined as input, the arg is optional. When the schema type is widened
// to plain StandardSchemaV1, InferSchemaInput resolves to unknown — we treat
// that case as "not optional" (permissive) to avoid false positives.
type IsArgOptional<TField> = TField extends { readonly schema: infer TSchema }
  ? unknown extends InferSchemaInput<TSchema>
    ? false
    : undefined extends InferSchemaInput<TSchema>
      ? true
      : false
  : TField extends { readonly type: PrimitiveFieldType }
    ? HasDefaultValue<TField> extends true
      ? true
      : TField extends { readonly required: true }
        ? false
        : true
    : false;

// Recursively validates that no required arg follows an optional arg.
type IsValidArgOrder<
  TArgs extends readonly any[],
  TSeenOptional extends boolean = false,
> = TArgs extends readonly [infer THead, ...infer TTail]
  ? IsArgOptional<THead> extends true
    ? IsValidArgOrder<TTail, true>
    : TSeenOptional extends true
      ? false
      : IsValidArgOrder<TTail, false>
  : true;

// When arg ordering is invalid, intersects to make `args` accept `never`.
export type ValidateArgOrder<TArgs> = TArgs extends readonly CommandArgField[]
  ? IsValidArgOrder<TArgs> extends false
    ? { readonly args: never }
    : unknown
  : unknown;

// Flattens mapped types for cleaner editor hover output.
type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] };

// Converts declared field arrays into the object shape exposed to command code.
export type InferNamedFields<TFields extends readonly NamedField[]> = Simplify<
  {
    [TField in TFields[number] as IsRequiredField<TField> extends true
      ? FieldName<TField>
      : never]: FieldValue<TField>;
  } & {
    [TField in TFields[number] as IsRequiredField<TField> extends true
      ? never
      : FieldName<TField>]?: FieldValue<TField>;
  }
>;

// Converts declared field arrays into the partial input shape accepted pre-normalization.
export type InferExecutionFields<TFields extends readonly NamedField[]> = Simplify<{
  [TField in TFields[number] as FieldName<TField>]?: FieldInputValue<TField>;
}>;

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
}

/** The command definition object accepted by {@link defineCommand}. */
export interface DefineCommandInput<
  TArgsFields extends readonly CommandArgField[] | undefined = undefined,
  TOptionsFields extends readonly CommandOptionField[] | undefined = undefined,
> {
  /** One-line summary shown in `--help` output. */
  readonly description?: string | undefined;
  /**
   * Positional arguments declared in the order they appear on the command line.
   * Required arguments must come before optional ones.
   * Argument names must be non-empty and unique within the command.
   *
   * Each entry is either a primitive field (`{ name, type }`) or a schema
   * field (`{ name, schema }`).
   */
  readonly args?: TArgsFields;
  /**
   * Options declared as `--name` flags, with optional single-character aliases.
   * Option names must be unique within the command, start with a letter, and
   * contain only letters, numbers, and internal hyphens.
   *
   * Each entry is either a primitive field (`{ name, type }`) or a schema
   * field (`{ name, schema }`).
   */
  readonly options?: TOptionsFields;
  /**
   * The function executed when this command is invoked.
   * Receives a {@link CommandContext} with fully parsed `args` and `options`.
   */
  readonly run: (
    ctx: CommandContext<
      InferNamedFields<NormalizeFields<TOptionsFields, CommandOptionField>>,
      InferNamedFields<NormalizeFields<TArgsFields, CommandArgField>>
    >,
  ) => void | Promise<void>;
}

// The normalized command object returned by `defineCommand`.
export interface DefinedCommand<
  TArgsFields extends readonly CommandArgField[] = readonly [],
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> {
  readonly description?: string | undefined;
  readonly args: TArgsFields;
  readonly options: TOptionsFields;
  readonly run: (
    ctx: CommandContext<InferNamedFields<TOptionsFields>, InferNamedFields<TArgsFields>>,
  ) => void | Promise<void>;
}

// Extracts the inferred options object from a defined command.
export type InferCommandOptions<TCommand> =
  TCommand extends DefinedCommand<any, infer TOptionsFields>
    ? InferNamedFields<TOptionsFields>
    : never;

// Extracts the inferred args object from a defined command.
export type InferCommandArgs<TCommand> =
  TCommand extends DefinedCommand<infer TArgsFields, any> ? InferNamedFields<TArgsFields> : never;
