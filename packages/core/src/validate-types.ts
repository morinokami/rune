import type { CommandArgField, CommandOptionField, NamedField } from "./field-types";
import type {
  AlwaysReservedOptionName,
  ErrorMessage,
  HasDuplicateOrCollidingName,
  HasDuplicateShort,
  HasInvalidArgFieldName,
  HasInvalidOptionFieldName,
  HasNegationCollision,
  HasReservedOptionName,
  HasReservedShortName,
  IsTuple,
  IsValidArgOrder,
  JsonReservedOptionName,
} from "./internal-types";

// ---------------------------------------------------------------------------
// Composed validators — each returns `unknown` on success or
// `{ readonly args/options: ErrorMessage<"..."> }` on failure, where the
// descriptive string literal surfaces in the compiler diagnostic. All bail
// out to `unknown` for non-tuple (widened) arrays via the IsTuple guard.
// ---------------------------------------------------------------------------

type TupleOf<T, TField> = T extends readonly TField[]
  ? IsTuple<T> extends true
    ? T
    : never
  : never;

type NamedFieldTuple<T> = TupleOf<T, NamedField>;
type ArgFieldTuple<T> = TupleOf<T, CommandArgField>;
type OptionFieldTuple<T> = TupleOf<T, CommandOptionField>;

export type ValidateFieldNames<TArgs, TOpts> = ([NamedFieldTuple<TArgs>] extends [never]
  ? unknown
  : HasInvalidArgFieldName<NamedFieldTuple<TArgs>> extends true
    ? {
        readonly __invalidArgName: ErrorMessage<"ERROR: Invalid argument name. Names must be non-empty. Hyphenated argument names must start with a letter and contain only letters, numbers, and single internal hyphens.">;
      }
    : unknown) &
  ([NamedFieldTuple<TOpts>] extends [never]
    ? unknown
    : HasInvalidOptionFieldName<NamedFieldTuple<TOpts>> extends true
      ? {
          readonly __invalidOptionName: ErrorMessage<"ERROR: Invalid option name. Option names must start with a letter and contain only letters, numbers, and single internal hyphens.">;
        }
      : unknown);

export type ValidateUniqueNames<TArgs, TOpts> = ([NamedFieldTuple<TArgs>] extends [never]
  ? unknown
  : HasDuplicateOrCollidingName<NamedFieldTuple<TArgs>> extends true
    ? {
        readonly __duplicateArgName: ErrorMessage<"ERROR: Duplicate argument names. Each argument must have a unique name (including camelCase aliases).">;
      }
    : unknown) &
  ([NamedFieldTuple<TOpts>] extends [never]
    ? unknown
    : HasDuplicateOrCollidingName<NamedFieldTuple<TOpts>> extends true
      ? {
          readonly __duplicateOptionName: ErrorMessage<"ERROR: Duplicate option names. Each option must have a unique name (including camelCase aliases).">;
        }
      : unknown);

export type ValidateDuplicateShortNames<TOpts> = [OptionFieldTuple<TOpts>] extends [never]
  ? unknown
  : HasDuplicateShort<OptionFieldTuple<TOpts>> extends true
    ? {
        readonly __duplicateShort: ErrorMessage<"ERROR: Duplicate short aliases. Each option must use a unique single-letter short alias.">;
      }
    : unknown;

export type ValidateNegationCollision<TOpts> = [OptionFieldTuple<TOpts>] extends [never]
  ? unknown
  : HasNegationCollision<OptionFieldTuple<TOpts>> extends true
    ? {
        readonly __negationCollision: ErrorMessage<"ERROR: Option name conflicts with automatic --no-<name> negation of a boolean option with default true.">;
      }
    : unknown;

export type ValidateReservedNames<TOpts, TJson extends true | undefined = undefined> = [
  OptionFieldTuple<TOpts>,
] extends [never]
  ? unknown
  : HasReservedOptionName<
        OptionFieldTuple<TOpts>,
        TJson extends true
          ? AlwaysReservedOptionName | JsonReservedOptionName
          : AlwaysReservedOptionName
      > extends true
    ? {
        readonly __reservedOptionName: ErrorMessage<"ERROR: Option name conflicts with a framework-reserved flag (--help, or --json when json mode is enabled).">;
      }
    : HasReservedShortName<OptionFieldTuple<TOpts>> extends true
      ? {
          readonly __reservedShortName: ErrorMessage<"ERROR: Short name conflicts with a framework-reserved flag (-h).">;
        }
      : unknown;

// When arg ordering is invalid, intersects to make `args` unassignable with a
// descriptive message. For non-tuple (widened) arrays, bails out to `unknown`
// and defers to runtime.
export type ValidateArgOrder<TArgs> = [ArgFieldTuple<TArgs>] extends [never]
  ? unknown
  : IsValidArgOrder<ArgFieldTuple<TArgs>> extends false
    ? {
        readonly __invalidArgOrder: ErrorMessage<"ERROR: Invalid argument order. Required arguments must come before optional ones.">;
      }
    : unknown;
