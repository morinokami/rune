import type {
  CommandArgField,
  CommandOptionField,
  SchemaArgField,
  SchemaOptionField,
} from "./command-types";

// Any field whose runtime validation comes from a Standard Schema object.
export type SchemaField = SchemaArgField | SchemaOptionField;

// Narrows a command field to the schema-backed variants shared by parser/help code.
export function isSchemaField(field: CommandArgField | CommandOptionField): field is SchemaField {
  return "schema" in field && field.schema !== undefined;
}
