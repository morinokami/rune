export { defineCommand, isDefinedCommand, validateCommandAliases } from "./define-command";
export { defineGroup, isDefinedGroup } from "./define-group";
export { executeCommand } from "./execute-command";
export { createOutput } from "./output";
export { extractJsonFlag, parseCommandArgs } from "./parse-command-args";
export { runParsedCommand } from "./run-parsed-command";
export { isSchemaField } from "./schema-field";

export type {
  CommandArgField,
  CommandContext,
  CommandOptionField,
  DefinedCommand,
  InferExecutionFields,
  InferNamedFields,
  PrimitiveFieldType,
  PrimitiveArgField,
  PrimitiveOptionField,
  SchemaArgField,
  SchemaOptionField,
  SingleLetter,
} from "./command-types";
export type { DefineGroupInput, DefinedGroup } from "./define-group";
export type { ExecuteCommandInput, ExecuteCommandResult } from "./execute-command";
export type { CommandOutput, OutputSink } from "./output";
export type {
  ParseCommandArgsError,
  ParseCommandArgsResult,
  ParsedCommandInput,
} from "./parse-command-args";
export type { RunParsedCommandInput, RunParsedCommandResult } from "./run-parsed-command";
export type { SchemaField } from "./schema-field";
