import type { StandardSchemaV1 } from "@standard-schema/spec";

// Primitive field kinds supported by Rune without an external schema.
export type PrimitiveFieldType = "string" | "number" | "boolean";
type RepeatablePrimitiveFieldType = Exclude<PrimitiveFieldType, "boolean">;

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
   * When `true`, the field must be provided by the user. Omit to make the
   * field optional. Absent fields are `undefined` in `ctx`, except primitive
   * boolean options, which default to `false`.
   */
  readonly required?: true | undefined;
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

// Values allowed as enum choices.
export type EnumFieldValue = string | number;

// Shared base for enum-backed arg/option fields. Internal to core.
interface EnumFieldBase<
  TName extends string,
  TValues extends readonly EnumFieldValue[],
> extends NamedField<TName> {
  /** Discriminator for enum (choice) fields. */
  readonly type: "enum";
  /**
   * Allowed values for this field. The CLI raw token is matched against each
   * entry using string comparison (`String(value) === rawToken`), so
   * `values: [1, 2]` accepts `"1"` or `"2"` but not `"007"` / `"1.0"`.
   */
  readonly values: TValues;
  /**
   * When `true`, the field must be provided by the user. Omit to make the
   * field optional.
   */
  readonly required?: true | undefined;
  /** Value used when the user does not provide this field. Must be one of `values`. */
  readonly default?: TValues[number] | undefined;
  readonly schema?: never;
}

// A positional argument that accepts one of a fixed set of values.
export interface EnumArgField<
  TName extends string = string,
  TValues extends readonly EnumFieldValue[] = readonly EnumFieldValue[],
> extends EnumFieldBase<TName, TValues> {
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

interface PrimitiveOptionBase<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> extends PrimitiveFieldBase<TName, TType> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly short?: SingleLetter | undefined;
  /** Environment variable used as a fallback when this option is not provided via CLI. */
  readonly env?: string | undefined;
  readonly flag?: never;
}

export interface ScalarPrimitiveOptionField<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> extends PrimitiveOptionBase<TName, TType> {
  readonly multiple?: never;
}

export interface MultiplePrimitiveOptionField<
  TName extends string = string,
  TType extends RepeatablePrimitiveFieldType = RepeatablePrimitiveFieldType,
> extends Omit<PrimitiveOptionBase<TName, TType>, "default" | "env"> {
  /**
   * Allows this option to be provided more than once. Parsed values are exposed
   * as an array in declaration order.
   */
  readonly multiple: true;
  /** Array used when the user does not provide this option. */
  readonly default?: readonly PrimitiveFieldValue<TType>[] | undefined;
  readonly env?: never;
}

// An option flag backed by Rune's primitive field types.
export type PrimitiveOptionField<
  TName extends string = string,
  TType extends PrimitiveFieldType = PrimitiveFieldType,
> =
  | ScalarPrimitiveOptionField<TName, TType>
  | (Extract<TType, RepeatablePrimitiveFieldType> extends never
      ? never
      : MultiplePrimitiveOptionField<TName, Extract<TType, RepeatablePrimitiveFieldType>>);

interface SchemaOptionBase<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaFieldBase<TName, TSchema> {
  /** Single-character shorthand (e.g. `"v"` for `--verbose` → `-v`). */
  readonly short?: SingleLetter | undefined;
}

interface SchemaValueOptionBase<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaOptionBase<TName, TSchema> {
  readonly flag?: never;
}

export interface ScalarSchemaValueOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaValueOptionBase<TName, TSchema> {
  readonly multiple?: never;
  /** Environment variable used as a fallback when this option is not provided via CLI. */
  readonly env?: string | undefined;
}

export interface MultipleSchemaValueOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaValueOptionBase<TName, TSchema> {
  /**
   * Allows this option to be provided more than once. The schema receives the
   * collected raw string values as an array.
   *
   * Unlike primitive and enum fields, schema-backed fields use the schema for
   * output/default typing, so there is no separate multiple-specific variant.
   */
  readonly multiple: true;
  readonly env?: never;
}

export type SchemaValueOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> = ScalarSchemaValueOptionField<TName, TSchema> | MultipleSchemaValueOptionField<TName, TSchema>;

export interface SchemaFlagOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends SchemaOptionBase<TName, TSchema> {
  /**
   * When `true`, the option is parsed as a boolean flag (no value expected).
   * The schema receives `true` when the flag is present, `undefined` when absent.
   */
  readonly flag: true;
  readonly multiple?: never;
  /** Environment variable used as a fallback when this option is not provided via CLI. */
  readonly env?: string | undefined;
}

// An option backed by a Standard Schema object.
export type SchemaOptionField<
  TName extends string = string,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> = SchemaValueOptionField<TName, TSchema> | SchemaFlagOptionField<TName, TSchema>;

interface EnumOptionBase<
  TName extends string = string,
  TValues extends readonly EnumFieldValue[] = readonly EnumFieldValue[],
> extends Omit<EnumFieldBase<TName, TValues>, "default"> {
  /** Single-character shorthand (e.g. `"m"` for `--mode` → `-m`). */
  readonly short?: SingleLetter | undefined;
  // Enum options always take a value, so the flag form is disallowed.
  readonly flag?: never;
}

export interface ScalarEnumOptionField<
  TName extends string = string,
  TValues extends readonly EnumFieldValue[] = readonly EnumFieldValue[],
> extends EnumOptionBase<TName, TValues> {
  /** Value used when the user does not provide this field. Must be one of `values`. */
  readonly default?: TValues[number] | undefined;
  readonly multiple?: never;
  /** Environment variable used as a fallback when this option is not provided via CLI. */
  readonly env?: string | undefined;
}

export interface MultipleEnumOptionField<
  TName extends string = string,
  TValues extends readonly EnumFieldValue[] = readonly EnumFieldValue[],
> extends EnumOptionBase<TName, TValues> {
  /**
   * Allows this option to be provided more than once. Parsed values are exposed
   * as an array in declaration order.
   */
  readonly multiple: true;
  /** Array used when the user does not provide this option. */
  readonly default?: readonly TValues[number][] | undefined;
  readonly env?: never;
}

// An option that accepts one of a fixed set of values.
export type EnumOptionField<
  TName extends string = string,
  TValues extends readonly EnumFieldValue[] = readonly EnumFieldValue[],
> = ScalarEnumOptionField<TName, TValues> | MultipleEnumOptionField<TName, TValues>;

// Any supported positional argument field.
export type CommandArgField = PrimitiveArgField | SchemaArgField | EnumArgField;

// Any supported option field.
export type CommandOptionField = PrimitiveOptionField | SchemaOptionField | EnumOptionField;

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
