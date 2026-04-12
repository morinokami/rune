/**
 * Converts a kebab-case string to camelCase.
 *
 * This is the single runtime implementation of the kebab→camel convention.
 * The type-level counterpart is `KebabToCamelCase` in `command-type-internals.ts`;
 * both must produce identical camelCase aliases for any input allowed by
 * `OPTION_NAME_RE` in `define-command.ts`. When changing the conversion
 * rule, update both sides together.
 */
export function kebabToCamelCase(str: string): string {
  return str.replace(/-(.)/g, (_, char: string) => char.toUpperCase());
}

// Ensures canonical (field.name) keys are populated from camelCase aliases
// that the caller may have used instead. This must run before any logic that
// looks up values by field.name.
export function normalizeToCanonicalKeys(
  fields: readonly { readonly name: string }[],
  record: Record<string, unknown>,
): Record<string, unknown> {
  for (const field of fields) {
    if (record[field.name] === undefined && field.name.includes("-")) {
      const camelKey = kebabToCamelCase(field.name);

      if (camelKey in record) {
        record[field.name] = record[camelKey];
      }
    }
  }

  return record;
}

// Adds camelCase aliases for any kebab-case keys in the given record.
// Mutates and returns the same object.
export function addCamelCaseAliases<T extends Record<string, unknown>>(record: T): T {
  for (const key of Object.keys(record)) {
    if (key.includes("-")) {
      record[kebabToCamelCase(key) as keyof T] = record[key] as T[keyof T];
    }
  }

  return record;
}
