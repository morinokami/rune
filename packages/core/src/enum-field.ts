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

const BARE_ENUM_VALUE_RE = /^[A-Za-z0-9_.-]+$/;

// Formats a single enum value for user-facing display. Numbers render as-is;
// strings that match identifier-like characters render bare, otherwise they
// are JSON-encoded so whitespace and special characters remain unambiguous.
export function formatEnumValueForDisplay(value: EnumFieldValue): string {
  if (typeof value === "number") {
    return String(value);
  }
  return BARE_ENUM_VALUE_RE.test(value) ? value : JSON.stringify(value);
}

// Looks up a raw CLI token against an enum field's allowed values using
// stringified comparison (`String(value) === raw`). Returns the matched
// original value so downstream consumers see the declared `string | number`.
export function matchEnumValue(
  values: readonly EnumFieldValue[],
  raw: string,
): EnumFieldValue | undefined {
  return values.find((value) => String(value) === raw);
}
