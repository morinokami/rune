import type { StandardSchemaV1 } from "@standard-schema/spec";

// Primitive field kinds supported by Rune without an external schema.
export type PrimitiveFieldType = "string" | "number" | "boolean";

// Maps a primitive field kind to the runtime value it produces.
export type PrimitiveFieldValue<TType extends PrimitiveFieldType> = TType extends "string"
  ? string
  : TType extends "number"
    ? number
    : boolean;

// Shared base for every arg/option field. Internal to core; not re-exported
// from `index.ts`.
export interface NamedField<TName extends string = string> {
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
  /**
   * Display-only type hint shown in `--help` output (e.g. `"uuid"`, `"port"`).
   * Rendered as `<typeLabel>` next to the field name. Has no effect on
   * validation or type inference.
   */
  readonly typeLabel?: string | undefined;
  /**
   * Display-only default-value label shown in `--help` output (e.g. `"3000"`).
   * Rendered as `(default: defaultLabel)` in the description column. Has no
   * effect on required/optional handling, which is still derived from the
   * schema itself.
   */
  readonly defaultLabel?: string | undefined;
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

export type LowercaseLetter =
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
  | "z";

export type UppercaseLetter = Uppercase<LowercaseLetter>;

// Single ASCII letter, used to constrain option short names.
export type SingleLetter = LowercaseLetter | UppercaseLetter;
