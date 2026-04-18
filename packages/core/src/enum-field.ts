import type {
  CommandArgField,
  CommandOptionField,
  EnumArgField,
  EnumFieldValue,
  EnumOptionField,
} from "./field-types";

// Any field whose values are one of a fixed enumerated set.
export type EnumField = EnumArgField | EnumOptionField;

// Narrows a command field to the enum-backed variants shared by parser/help code.
export function isEnumField(field: CommandArgField | CommandOptionField): field is EnumField {
  return field.type === "enum";
}

// Allowed shape for string enum values. Restricted to identifier-like tokens
// so values render unambiguously in help/error output and play well with
// shell completion. Can be relaxed later without breaking existing users.
export const ENUM_STRING_VALUE_PATTERN = /^[A-Za-z0-9_.-]+$/;

// Looks up a raw CLI token against an enum field's allowed values using
// stringified comparison (`String(value) === raw`). Returns the matched
// original value so downstream consumers see the declared `string | number`.
export function matchEnumValue(
  values: readonly EnumFieldValue[],
  raw: string,
): EnumFieldValue | undefined {
  return values.find((value) => String(value) === raw);
}
