// Type-level primitives shared across validation and inference.

// Single decimal digit, used for option and hyphenated arg name validation.
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

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
export type IsTuple<T extends readonly unknown[]> = number extends T["length"] ? false : true;

// Flattens mapped types for cleaner editor hover output.
export type Simplify<TValue> = { [TKey in keyof TValue]: TValue[TKey] };

/** Branded string type that is unassignable from any value, surfacing `TMessage` in compiler errors. */
export type ErrorMessage<TMessage extends string> = TMessage & {
  readonly __brand: "FieldValidationError";
};
