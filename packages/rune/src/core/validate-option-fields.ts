import type { CommandArgField, CommandOptionField, EnumFieldValue } from "./field-types";

import { kebabToCamelCase } from "./camel-case-aliases";
import { ENUM_STRING_VALUE_PATTERN, isEnumField } from "./enum-field";
import { isSchemaField } from "./schema-field";

// Shared format constants for option fields. The type-level KebabToCamelCase
// helper mirrors `OPTION_NAME_RE`; keep them in sync.
export const OPTION_NAME_RE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
export const OPTION_SHORT_RE = /^[a-zA-Z]$/;

export function validateOptionNameFormats(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if (field.name.length === 0) {
      throw new Error(`Invalid option name "${field.name}". Names must be non-empty.`);
    }

    if (!OPTION_NAME_RE.test(field.name)) {
      throw new Error(
        `Invalid option name "${field.name}". Option names must start with a letter and contain only letters, numbers, and internal hyphens.`,
      );
    }
  }
}

export function validateOptionShortFormats(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if (field.short === undefined) {
      continue;
    }

    if (!OPTION_SHORT_RE.test(field.short)) {
      throw new Error(
        `Invalid short name "${field.short}" for option "${field.name}". Short name must be a single letter.`,
      );
    }
  }
}

export function validateOptionMultipleFlags(options: readonly CommandOptionField[]): void {
  for (const field of options) {
    if (!hasMultipleFlag(field)) {
      continue;
    }

    if (!isSchemaField(field) && !isEnumField(field) && field.type === "boolean") {
      throw new Error(`Boolean option "${field.name}" cannot use multiple: true.`);
    }

    if (isSchemaField(field) && field.flag === true) {
      throw new Error(`Schema flag option "${field.name}" cannot use multiple: true.`);
    }
  }
}

export function validateOptionNegationCollisions(options: readonly CommandOptionField[]): void {
  const allNames = new Set(options.map((field) => field.name));

  for (const field of options) {
    if (
      !isSchemaField(field) &&
      !isEnumField(field) &&
      field.type === "boolean" &&
      field.default === true
    ) {
      const negName = `no-${field.name}`;

      if (allNames.has(negName)) {
        throw new Error(
          `Option "${negName}" conflicts with the automatic negation of boolean option "${field.name}".`,
        );
      }
    }
  }
}

export function validateUniqueOptionShortNames(options: readonly CommandOptionField[]): void {
  const seen = new Set<string>();

  for (const field of options) {
    if (field.short === undefined) {
      continue;
    }

    if (seen.has(field.short)) {
      throw new Error(`Duplicate short name "${field.short}" for option "${field.name}".`);
    }

    seen.add(field.short);
  }
}

export function validateUniqueFieldAndAliasNames(
  fields: readonly (CommandArgField | CommandOptionField)[],
  kind: "argument" | "option",
): void {
  const seen = new Set<string>();

  for (const field of fields) {
    if (seen.has(field.name)) {
      throw new Error(`Duplicate ${kind} name "${field.name}".`);
    }

    seen.add(field.name);

    if (field.name.includes("-")) {
      const camelName = kebabToCamelCase(field.name);

      if (seen.has(camelName)) {
        throw new Error(
          `${kind === "argument" ? "Argument" : "Option"} "${field.name}" conflicts with "${camelName}" (same camelCase alias).`,
        );
      }

      seen.add(camelName);
    }
  }
}

export function validateEnumFields(
  fields: readonly (CommandArgField | CommandOptionField)[],
  kind: "argument" | "option",
): void {
  for (const field of fields) {
    if (!isEnumField(field)) {
      continue;
    }

    if (field.values.length === 0) {
      throw new Error(`Enum ${kind} "${field.name}" must declare at least one value in "values".`);
    }

    const seen = new Set<string>();

    for (const value of field.values) {
      if (typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Enum ${kind} "${field.name}" values must be strings or numbers.`);
      }

      if (typeof value === "string" && value === "") {
        throw new Error(`Enum ${kind} "${field.name}" values must not include the empty string.`);
      }

      if (typeof value === "string" && !ENUM_STRING_VALUE_PATTERN.test(value)) {
        throw new Error(
          `Enum ${kind} "${field.name}" has invalid string value ${JSON.stringify(value)}. String values must match ${ENUM_STRING_VALUE_PATTERN.toString()} (letters, digits, "_", ".", "-").`,
        );
      }

      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`Enum ${kind} "${field.name}" values must not include NaN or Infinity.`);
      }

      const key = String(value);

      if (seen.has(key)) {
        throw new Error(
          `Enum ${kind} "${field.name}" has duplicate value "${key}". Values must be unique after string conversion.`,
        );
      }

      seen.add(key);
    }

    if (field.default !== undefined) {
      const defaultValues =
        kind === "option" && hasMultipleFlag(field)
          ? (field.default as readonly EnumFieldValue[])
          : [field.default];

      for (const defaultValue of defaultValues) {
        if (!seen.has(String(defaultValue))) {
          throw new Error(
            `Default value "${String(defaultValue)}" for enum ${kind} "${field.name}" is not listed in "values".`,
          );
        }
      }
    }
  }
}

export function hasMultipleFlag(field: object): boolean {
  return "multiple" in field && field.multiple === true;
}
