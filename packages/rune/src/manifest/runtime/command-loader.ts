import {
  isDefinedCommand,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
} from "@rune-cli/core";
import { pathToFileURL } from "node:url";

import type { CommandManifestCommandNode } from "../manifest-types";

// Loads a command module and verifies that its default export was created with defineCommand().
async function loadCommandFromModule(
  sourceFilePath: string,
): Promise<DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>> {
  // In `rune dev`, `sourceFilePath` points at source `.ts` command modules.
  const moduleUrl = pathToFileURL(sourceFilePath).href;
  const loadedModule = (await import(moduleUrl)) as { default?: unknown };

  if (loadedModule.default === undefined) {
    throw new Error(`Command module did not export a default command: ${sourceFilePath}`);
  }

  if (!isDefinedCommand(loadedModule.default)) {
    throw new Error(
      `Command module must export a value created with defineCommand(). Got ${describeCommandModuleExport(loadedModule.default)}.`,
    );
  }

  return loadedModule.default;
}

function describeCommandModuleExport(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "an array";
  }

  if (typeof value === "object") {
    return "a plain object";
  }

  if (typeof value === "string") {
    return "a string";
  }

  if (typeof value === "number") {
    return "a number";
  }

  if (typeof value === "boolean") {
    return "a boolean";
  }

  if (typeof value === "bigint") {
    return "a bigint";
  }

  if (typeof value === "symbol") {
    return "a symbol";
  }

  if (typeof value === "function") {
    return "a function";
  }

  return "an unsupported value";
}

export type LoadCommandFn = (
  node: CommandManifestCommandNode,
) => Promise<DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>>;

// Default loader that imports the command module from its source file path.
export const defaultLoadCommand: LoadCommandFn = (node) =>
  loadCommandFromModule(node.sourceFilePath);
