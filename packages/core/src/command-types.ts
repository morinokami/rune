import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { CommandOutput } from "./output";

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
   * For args, any non-empty name is allowed. Hyphenated names must follow
   * the same rules as options (no consecutive, leading, or trailing hyphens).
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
   * Omitted or `false` makes the field optional. Absent fields are `undefined`
   * in `ctx`, except primitive boolean options, which default to `false`.
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
  readonly short?: never;
  readonly flag?: never;
}

// A positional argument backed by a Standard Schema object.
export interface SchemaArgField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaFieldBase<TName, TSchema> {
  readonly short?: never;
  readonly flag?: never;
}

// An option flag backed by Rune's primitive field types.
export interface PrimitiveOptionField<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> extends PrimitiveFieldBase<TName, TType> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly short?: SingleLetter | undefined;
  readonly flag?: never;
}

// An option backed by a Standard Schema object.
export interface SchemaOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaFieldBase<TName, TSchema> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly short?: SingleLetter | undefined;
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

// Single ASCII letter, used to constrain option short names.
export type SingleLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

// Converts a kebab-case string to camelCase at the type level.
type KebabToCamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<KebabToCamelCase<Tail>>}`
  : S;

// ---------------------------------------------------------------------------
// Tuple guard — returns true only for fixed-length tuple types.
// For non-tuple arrays (e.g. `readonly CommandOptionField[]`), `number extends
// T["length"]` is true, so the guard returns false and validators bail out to
// `unknown`, deferring to the runtime check.
// ---------------------------------------------------------------------------

type IsTuple<T extends readonly any[]> = number extends T["length"] ? false : true;

// ---------------------------------------------------------------------------
// Field name validation
// ---------------------------------------------------------------------------

// Rejects names with consecutive hyphens, leading hyphens, or trailing hyphens.
type IsValidHyphenatedName<S extends string> = S extends `${string}--${string}`
  ? false
  : S extends `-${string}`
    ? false
    : S extends `${string}-`
      ? false
      : true;

// Validates a single field's name: rejects empty names and invalid hyphenation.
type IsValidFieldName<TField> = TField extends { readonly name: infer N extends string }
  ? N extends ""
    ? false
    : N extends `${string}-${string}`
      ? IsValidHyphenatedName<N> extends false
        ? false
        : true
      : true
  : true;

// Walks a tuple looking for any field with an invalid name.
type HasInvalidFieldName<TFields extends readonly NamedField[]> = TFields extends readonly [
  infer H,
  ...infer T extends readonly NamedField[],
]
  ? IsValidFieldName<H> extends false
    ? true
    : HasInvalidFieldName<T>
  : false;

// ---------------------------------------------------------------------------
// Duplicate field name detection (includes camelCase alias collision)
// ---------------------------------------------------------------------------

type HasDuplicateOrCollidingName<
  TFields extends readonly NamedField[],
  TSeen extends string = never,
> = TFields extends readonly [infer H extends NamedField, ...infer T extends readonly NamedField[]]
  ? H extends { readonly name: infer N extends string }
    ? string extends N // widened name — skip, defer to runtime
      ? HasDuplicateOrCollidingName<T, TSeen>
      : N extends TSeen
        ? true
        : KebabToCamelCase<N> extends TSeen
          ? true
          : HasDuplicateOrCollidingName<T, TSeen | N | KebabToCamelCase<N>>
    : HasDuplicateOrCollidingName<T, TSeen>
  : false;

// ---------------------------------------------------------------------------
// Duplicate short name detection
// ---------------------------------------------------------------------------

type HasDuplicateShort<
  TFields extends readonly CommandOptionField[],
  TSeen extends string = never,
> = TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
  ? H extends { readonly short: infer S extends string }
    ? SingleLetter extends S // widened short (full union) — skip, defer to runtime
      ? HasDuplicateShort<T, TSeen>
      : S extends TSeen
        ? true
        : HasDuplicateShort<T, TSeen | S>
    : HasDuplicateShort<T, TSeen>
  : false;

// ---------------------------------------------------------------------------
// Composed validators — each returns `unknown` on success or
// `{ readonly args/options: ErrorMessage<"..."> }` on failure, where the
// descriptive string literal surfaces in the compiler diagnostic. All bail
// out to `unknown` for non-tuple (widened) arrays via the IsTuple guard.
// ---------------------------------------------------------------------------

/** Branded string type that is unassignable from any value, surfacing `TMessage` in compiler errors. */
type ErrorMessage<TMessage extends string> = TMessage & {
  readonly __brand: "FieldValidationError";
};

export type ValidateFieldNames<TArgs, TOpts> = (TArgs extends readonly NamedField[]
  ? IsTuple<TArgs> extends true
    ? HasInvalidFieldName<TArgs> extends true
      ? {
          readonly __invalidArgName: ErrorMessage<"ERROR: Invalid argument name. Names must be non-empty and must not start/end with hyphens or contain consecutive hyphens.">;
        }
      : unknown
    : unknown
  : unknown) &
  (TOpts extends readonly NamedField[]
    ? IsTuple<TOpts> extends true
      ? HasInvalidFieldName<TOpts> extends true
        ? {
            readonly __invalidOptionName: ErrorMessage<"ERROR: Invalid option name. Names must be non-empty and must not start/end with hyphens or contain consecutive hyphens.">;
          }
        : unknown
      : unknown
    : unknown);

export type ValidateUniqueNames<TArgs, TOpts> = (TArgs extends readonly NamedField[]
  ? IsTuple<TArgs> extends true
    ? HasDuplicateOrCollidingName<TArgs> extends true
      ? {
          readonly __duplicateArgName: ErrorMessage<"ERROR: Duplicate argument names. Each argument must have a unique name (including camelCase aliases).">;
        }
      : unknown
    : unknown
  : unknown) &
  (TOpts extends readonly NamedField[]
    ? IsTuple<TOpts> extends true
      ? HasDuplicateOrCollidingName<TOpts> extends true
        ? {
            readonly __duplicateOptionName: ErrorMessage<"ERROR: Duplicate option names. Each option must have a unique name (including camelCase aliases).">;
          }
        : unknown
      : unknown
    : unknown);

export type ValidateDuplicateShortNames<TOpts> = TOpts extends readonly CommandOptionField[]
  ? IsTuple<TOpts> extends true
    ? HasDuplicateShort<TOpts> extends true
      ? {
          readonly __duplicateShort: ErrorMessage<"ERROR: Duplicate short aliases. Each option must use a unique single-letter short alias.">;
        }
      : unknown
    : unknown
  : unknown;

// Pulls the declared field name out of a field definition and includes a
// camelCase alias so kebab-case fields can be accessed with either casing.
type FieldName<TField> = TField extends { readonly name: infer TName extends string }
  ? TName | KebabToCamelCase<TName>
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

// Detects whether a field declares an actual default value.
type HasDefaultValue<TField> = TField extends { readonly default: infer TDefault }
  ? [TDefault] extends [undefined]
    ? false
    : true
  : false;

// Decides whether a field becomes required on `ctx.args` / `ctx.options`.
// When `TBooleanAlwaysPresent` is `true`, primitive boolean fields without an
// explicit default are treated as required because they implicitly default to
// `false`. This is only enabled for option fields, not positional args.
type IsRequiredField<TField, TBooleanAlwaysPresent extends boolean = false> = TField extends {
  readonly schema: infer TSchema;
}
  ? IsOptionalSchemaOutput<InferSchemaOutput<TSchema>> extends true
    ? false
    : true
  : HasDefaultValue<TField> extends true
    ? true
    : TBooleanAlwaysPresent extends true
      ? TField extends { readonly type: "boolean" }
        ? true
        : TField extends { readonly required: true }
          ? true
          : false
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

// When arg ordering is invalid, intersects to make `args` unassignable with a
// descriptive message. For non-tuple (widened) arrays, bails out to `unknown`
// and defers to runtime.
export type ValidateArgOrder<TArgs> = TArgs extends readonly CommandArgField[]
  ? IsTuple<TArgs> extends true
    ? IsValidArgOrder<TArgs> extends false
      ? {
          readonly __invalidArgOrder: ErrorMessage<"ERROR: Invalid argument order. Required arguments must come before optional ones.">;
        }
      : unknown
    : unknown
  : unknown;

// Flattens mapped types for cleaner editor hover output.
type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] };

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
  ) => TJson extends true ? unknown : void | Promise<void>;
}

// The normalized command object returned by `defineCommand`.
export interface DefinedCommand<
  TArgsFields extends readonly CommandArgField[] = readonly [],
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
  TJson extends boolean = boolean,
> {
  readonly description?: string | undefined;
  readonly json: TJson;
  readonly aliases: readonly string[];
  readonly examples: readonly string[];
  readonly args: TArgsFields;
  readonly options: TOptionsFields;
  readonly run: (
    ctx: CommandContext<InferNamedFields<TOptionsFields, true>, InferNamedFields<TArgsFields>>,
  ) => TJson extends true ? unknown : void | Promise<void>;
}

// Extracts the inferred options object from a defined command.
export type InferCommandOptions<TCommand> =
  TCommand extends DefinedCommand<any, infer TOptionsFields>
    ? InferNamedFields<TOptionsFields, true>
    : never;

// Extracts the inferred args object from a defined command.
export type InferCommandArgs<TCommand> =
  TCommand extends DefinedCommand<infer TArgsFields, any> ? InferNamedFields<TArgsFields> : never;
