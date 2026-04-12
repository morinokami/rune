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
} from "./command-type-internals";
import type { CommandArgField, CommandOptionField, NamedField } from "./field-types";

// ---------------------------------------------------------------------------
// Composed validators — each returns `unknown` on success or
// `{ readonly args/options: ErrorMessage<"..."> }` on failure, where the
// descriptive string literal surfaces in the compiler diagnostic. All bail
// out to `unknown` for non-tuple (widened) arrays via the IsTuple guard.
// ---------------------------------------------------------------------------

export type ValidateFieldNames<TArgs, TOpts> = (TArgs extends readonly NamedField[]
  ? IsTuple<TArgs> extends true
    ? HasInvalidArgFieldName<TArgs> extends true
      ? {
          readonly __invalidArgName: ErrorMessage<"ERROR: Invalid argument name. Names must be non-empty. Hyphenated argument names must start with a letter and contain only letters, numbers, and single internal hyphens.">;
        }
      : unknown
    : unknown
  : unknown) &
  (TOpts extends readonly NamedField[]
    ? IsTuple<TOpts> extends true
      ? HasInvalidOptionFieldName<TOpts> extends true
        ? {
            readonly __invalidOptionName: ErrorMessage<"ERROR: Invalid option name. Option names must start with a letter and contain only letters, numbers, and single internal hyphens.">;
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

export type ValidateNegationCollision<TOpts> = TOpts extends readonly CommandOptionField[]
  ? IsTuple<TOpts> extends true
    ? HasNegationCollision<TOpts> extends true
      ? {
          readonly __negationCollision: ErrorMessage<"ERROR: Option name conflicts with automatic --no-<name> negation of a boolean option with default true.">;
        }
      : unknown
    : unknown
  : unknown;

export type ValidateReservedNames<
  TOpts,
  TJson extends boolean = false,
> = TOpts extends readonly CommandOptionField[]
  ? IsTuple<TOpts> extends true
    ? HasReservedOptionName<
        TOpts,
        TJson extends true
          ? AlwaysReservedOptionName | JsonReservedOptionName
          : AlwaysReservedOptionName
      > extends true
      ? {
          readonly __reservedOptionName: ErrorMessage<"ERROR: Option name conflicts with a framework-reserved flag (--help, or --json when json mode is enabled).">;
        }
      : HasReservedShortName<TOpts> extends true
        ? {
            readonly __reservedShortName: ErrorMessage<"ERROR: Short name conflicts with a framework-reserved flag (-h).">;
          }
        : unknown
    : unknown
  : unknown;

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
