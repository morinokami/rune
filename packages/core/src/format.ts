import type { CommandArgField, CommandOptionField } from "./command-types";

import { isSchemaField } from "./schema-field";

// Formats the type hint suffix for a field (e.g. ` <string>`), empty for schema fields.
export function formatFieldTypeHint(field: CommandArgField | CommandOptionField): string {
  if (isSchemaField(field)) {
    return "";
  }

  return ` <${field.type}>`;
}
