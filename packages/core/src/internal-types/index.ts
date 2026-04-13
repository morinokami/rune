// Internal type-level helpers shared by command and validation typings.

export type { Digit, ErrorMessage, IsTuple, KebabToCamelCase, Simplify } from "./utils";
export type { HasInvalidArgFieldName, HasInvalidOptionFieldName } from "./field-name-validation";
export type {
  AlwaysReservedOptionName,
  HasDuplicateOrCollidingName,
  HasDuplicateShort,
  HasNegationCollision,
  HasReservedOptionName,
  HasReservedShortName,
  JsonReservedOptionName,
} from "./field-collision";
export type { FieldName, FieldValue, IsRequiredField, IsValidArgOrder } from "./field-inference";
