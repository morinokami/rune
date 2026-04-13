import type { CommandOptionField, NamedField, SingleLetter } from "../field-types";
import type { KebabToCamelCase } from "./utils";

// Type-level helpers for duplicate, collision, and reserved-name checks.

export type HasDuplicateOrCollidingName<
  TFields extends readonly NamedField[],
  TSeen extends string = never,
> = TFields extends readonly [infer H extends NamedField, ...infer T extends readonly NamedField[]]
  ? H extends { readonly name: infer N extends string }
    ? string extends N
      ? HasDuplicateOrCollidingName<T, TSeen>
      : N extends TSeen
        ? true
        : KebabToCamelCase<N> extends TSeen
          ? true
          : HasDuplicateOrCollidingName<T, TSeen | N | KebabToCamelCase<N>>
    : HasDuplicateOrCollidingName<T, TSeen>
  : false;

export type HasDuplicateShort<
  TFields extends readonly CommandOptionField[],
  TSeen extends string = never,
> = TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
  ? H extends { readonly short: infer S extends string }
    ? SingleLetter extends S
      ? HasDuplicateShort<T, TSeen>
      : S extends TSeen
        ? true
        : HasDuplicateShort<T, TSeen | S>
    : HasDuplicateShort<T, TSeen>
  : false;

type IsNegatableOption<TField> = TField extends {
  readonly type: "boolean";
  readonly default: true;
}
  ? true
  : false;

type CollectNegationNames<TFields extends readonly CommandOptionField[]> =
  TFields extends readonly [infer H, ...infer T extends readonly CommandOptionField[]]
    ? H extends { readonly name: infer N extends string }
      ? string extends N
        ? CollectNegationNames<T>
        : IsNegatableOption<H> extends true
          ? `no-${N}` | CollectNegationNames<T>
          : CollectNegationNames<T>
      : CollectNegationNames<T>
    : never;

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

export type AlwaysReservedOptionName = "help";
export type JsonReservedOptionName = "json";

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
