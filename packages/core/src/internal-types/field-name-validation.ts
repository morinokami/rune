import type { NamedField, SingleLetter } from "../field-types";
import type { Digit } from "./utils";

// Type-level helpers for validating field-name syntax.

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
