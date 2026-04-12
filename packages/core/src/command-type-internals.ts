import type { StandardSchemaV1 } from "@standard-schema/spec";

import type {
  CommandOptionField,
  NamedField,
  PrimitiveFieldType,
  PrimitiveFieldValue,
  SingleLetter,
} from "./field-types";

// ---------------------------------------------------------------------------
// Type-level primitives shared across validation and inference
// ---------------------------------------------------------------------------

// Single decimal digit, used for option and hyphenated arg name validation.
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * Converts a kebab-case string to camelCase at the type level.
 *
 * This is the single type-level implementation of the kebab→camel convention.
 * The runtime counterpart is `kebabToCamelCase` in `camel-case-aliases.ts`.
 * Both must produce identical camelCase aliases for any input allowed by
 * `OPTION_NAME_RE` in `define-command.ts`. When changing the conversion
 * rule, update both sides together.
 */
export type KebabToCamelCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}${Capitalize<KebabToCamelCase<Tail>>}`
  : S;

// Tuple guard — returns true only for fixed-length tuple types.
// For non-tuple arrays (e.g. `readonly CommandOptionField[]`), `number extends
// T["length"]` is true, so the guard returns false and validators bail out to
// `unknown`, deferring to the runtime check.
export type IsTuple<T extends readonly any[]> = number extends T["length"] ? false : true;

// Flattens mapped types for cleaner editor hover output.
export type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] };

/** Branded string type that is unassignable from any value, surfacing `TMessage` in compiler errors. */
export type ErrorMessage<TMessage extends string> = TMessage & {
  readonly __brand: "FieldValidationError";
};

// ---------------------------------------------------------------------------
// Field name validation
// ---------------------------------------------------------------------------

type AlphaNumericChar = SingleLetter | Digit;

type StartsWithLetter<S extends string> = S extends `${infer C}${string}`
  ? C extends SingleLetter
    ? true
    : false
  : false;

type IsAlphaNumericString<S extends string> = S extends `${infer C}${infer Rest}`
  ? C extends AlphaNumericChar
    ? Rest extends ""
      ? true
      : IsAlphaNumericString<Rest>
    : false
  : false;

type IsAlphaNumericSegment<S extends string> = S extends "" ? false : IsAlphaNumericString<S>;

type IsValidOptionTail<S extends string> = S extends `${infer Segment}-${infer Rest}`
  ? IsAlphaNumericSegment<Segment> extends true
    ? IsValidOptionTail<Rest>
    : false
  : IsAlphaNumericSegment<S>;

// Mirrors OPTION_NAME_RE in define-command.ts:
// ^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$
type IsValidOptionLikeName<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? Head extends ""
    ? false
    : StartsWithLetter<Head> extends true
      ? IsAlphaNumericString<Head> extends true
        ? IsValidOptionTail<Tail>
        : false
      : false
  : StartsWithLetter<S> extends true
    ? IsAlphaNumericString<S>
    : false;

type IsValidArgFieldName<TField> = TField extends { readonly name: infer N extends string }
  ? string extends N
    ? true
    : N extends ""
      ? false
      : N extends `${string}-${string}`
        ? IsValidOptionLikeName<N>
        : true
  : true;

type IsValidOptionFieldName<TField> = TField extends { readonly name: infer N extends string }
  ? string extends N
    ? true
    : N extends ""
      ? false
      : IsValidOptionLikeName<N>
  : true;

export type HasInvalidArgFieldName<TFields extends readonly NamedField[]> =
  TFields extends readonly [infer H, ...infer T extends readonly NamedField[]]
    ? IsValidArgFieldName<H> extends false
      ? true
      : HasInvalidArgFieldName<T>
    : false;

export type HasInvalidOptionFieldName<TFields extends readonly NamedField[]> =
  TFields extends readonly [infer H, ...infer T extends readonly NamedField[]]
    ? IsValidOptionFieldName<H> extends false
      ? true
      : HasInvalidOptionFieldName<T>
    : false;

// ---------------------------------------------------------------------------
// Duplicate field name detection (includes camelCase alias collision)
// ---------------------------------------------------------------------------

export type HasDuplicateOrCollidingName<
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

export type HasDuplicateShort<
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
// Negation collision detection
// ---------------------------------------------------------------------------

// True when a field is a primitive boolean option with `default: true`.
// Literal checks prevent matching widened types (e.g. `PrimitiveFieldType`,
// `boolean`), deferring to the runtime validator in those cases.
type IsNegatableOption<TField> = TField extends {
  readonly type: "boolean";
  readonly default: true;
}
  ? true
  : false;

// Collects `no-<name>` strings for every negatable option in the tuple.
type CollectNegationNames<TFields extends readonly CommandOptionField[]> =
  TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
    ? H extends { readonly name: infer N extends string }
      ? string extends N // widened name — skip, defer to runtime
        ? CollectNegationNames<T>
        : IsNegatableOption<H> extends true
          ? `no-${N}` | CollectNegationNames<T>
          : CollectNegationNames<T>
      : CollectNegationNames<T>
    : never;

// Walks the tuple checking whether any option name equals a collected negation name.
export type HasNegationCollision<
  TFields extends readonly CommandOptionField[],
  TNegNames extends string = CollectNegationNames<TFields>,
> = [TNegNames] extends [never]
  ? false
  : TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
    ? H extends { readonly name: infer N extends string }
      ? string extends N
        ? HasNegationCollision<T, TNegNames>
        : N extends TNegNames
          ? true
          : HasNegationCollision<T, TNegNames>
      : HasNegationCollision<T, TNegNames>
    : false;

// ---------------------------------------------------------------------------
// Reserved option name / short name detection
// ---------------------------------------------------------------------------

// Option names always reserved by the framework.
export type AlwaysReservedOptionName = "help";

// Option names reserved only when `json: true` is set.
export type JsonReservedOptionName = "json";

// Short names always reserved by the framework (-h for help).
type ReservedShortName = "h";

export type HasReservedOptionName<
  TFields extends readonly CommandOptionField[],
  TReserved extends string = AlwaysReservedOptionName,
> = TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
  ? H extends { readonly name: infer N extends string }
    ? string extends N
      ? HasReservedOptionName<T, TReserved>
      : N extends TReserved
        ? true
        : HasReservedOptionName<T, TReserved>
    : HasReservedOptionName<T, TReserved>
  : false;

export type HasReservedShortName<TFields extends readonly CommandOptionField[]> =
  TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
    ? H extends { readonly short: infer S extends string }
      ? SingleLetter extends S
        ? HasReservedShortName<T>
        : S extends ReservedShortName
          ? true
          : HasReservedShortName<T>
      : HasReservedShortName<T>
    : false;

// ---------------------------------------------------------------------------
// Inference helpers (consumed by `command-types.ts`)
// ---------------------------------------------------------------------------

// Pulls the declared field name out of a field definition and includes a
// camelCase alias so kebab-case fields can be accessed with either casing.
export type FieldName<TField> = TField extends { readonly name: infer TName extends string }
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
export type FieldValue<TField> = TField extends { readonly schema: infer TSchema }
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
export type IsRequiredField<
  TField,
  TBooleanAlwaysPresent extends boolean = false,
> = TField extends {
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
export type IsValidArgOrder<
  TArgs extends readonly any[],
  TSeenOptional extends boolean = false,
> = TArgs extends readonly [infer THead, ...infer TTail]
  ? IsArgOptional<THead> extends true
    ? IsValidArgOrder<TTail, true>
    : TSeenOptional extends true
      ? false
      : IsValidArgOrder<TTail, false>
  : true;
