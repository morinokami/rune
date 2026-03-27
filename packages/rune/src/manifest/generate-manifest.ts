import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import type { CommandManifest, CommandManifestNode, CommandManifestPath } from "./manifest-types";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "./manifest-map";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

const COMMAND_ENTRY_FILE = "index.ts";
const GROUP_META_FILE = "_group.ts";
const BARE_COMMAND_EXTENSION = ".ts";
const DECLARATION_FILE_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

export interface GenerateCommandManifestOptions {
  readonly commandsDirectory: string;
  readonly extractDescription?:
    | ((sourceFilePath: string) => Promise<string | undefined>)
    | undefined;
}

interface WalkDirectoryResult {
  readonly nodes: readonly CommandManifestNode[];
  readonly hasNode: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function comparePathSegments(left: CommandManifestPath, right: CommandManifestPath): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = left[index].localeCompare(right[index]);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length - right.length;
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function getStaticDescriptionValue(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Description extraction
// ---------------------------------------------------------------------------

function isDefineCommandExpression(expression: ts.Expression): boolean {
  return isNamedCallExpression(expression, "defineCommand");
}

function isDefineGroupExpression(expression: ts.Expression): boolean {
  return isNamedCallExpression(expression, "defineGroup");
}

function isNamedCallExpression(expression: ts.Expression, name: string): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === name;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === name;
  }

  return false;
}

function isDefineCallExpression(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    (isDefineCommandExpression(expression.expression) ||
      isDefineGroupExpression(expression.expression))
  );
}

function extractDescriptionFromCommandDefinition(
  expression: ts.Expression,
  knownDescriptions: ReadonlyMap<string, string | undefined>,
): string | undefined {
  if (ts.isIdentifier(expression)) {
    return knownDescriptions.get(expression.text);
  }

  if (!ts.isCallExpression(expression) || !isDefineCallExpression(expression)) {
    return undefined;
  }

  const [definition] = expression.arguments;

  if (!definition || !ts.isObjectLiteralExpression(definition)) {
    return undefined;
  }

  for (const property of definition.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const propertyName = getPropertyNameText(property.name);

    if (propertyName !== "description") {
      continue;
    }

    return getStaticDescriptionValue(property.initializer);
  }

  return undefined;
}

export async function extractDescriptionFromSourceFile(
  sourceFilePath: string,
): Promise<string | undefined> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const knownDescriptions = new Map<string, string | undefined>();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        knownDescriptions.set(
          declaration.name.text,
          extractDescriptionFromCommandDefinition(declaration.initializer, knownDescriptions),
        );
      }

      continue;
    }

    if (ts.isExportAssignment(statement)) {
      return extractDescriptionFromCommandDefinition(statement.expression, knownDescriptions);
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Group metadata validation
// ---------------------------------------------------------------------------

async function validateGroupMetaFile(sourceFilePath: string): Promise<void> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      continue;
    }

    if (ts.isImportDeclaration(statement)) {
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      const expression = ts.isIdentifier(statement.expression)
        ? findVariableInitializer(sourceFile, statement.expression.text)
        : statement.expression;

      if (
        expression &&
        ts.isCallExpression(expression) &&
        isDefineGroupExpression(expression.expression)
      ) {
        return;
      }

      throw new Error(
        `${sourceFilePath}: _group.ts must use "export default defineGroup(...)". Found a default export that is not a defineGroup() call.`,
      );
    }
  }

  throw new Error(`${sourceFilePath}: _group.ts must have a default export using defineGroup().`);
}

function findVariableInitializer(
  sourceFile: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer
      ) {
        return declaration.initializer;
      }
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Manifest tree walking
// ---------------------------------------------------------------------------

async function walkCommandsDirectory(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  extractDescription: (sourceFilePath: string) => Promise<string | undefined>,
): Promise<WalkDirectoryResult> {
  const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });

  const childDirectoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const childResults = await Promise.all(
    childDirectoryNames.map(async (directoryName) => {
      const childDirectoryPath = path.join(absoluteDirectoryPath, directoryName);
      const childResult = await walkCommandsDirectory(
        childDirectoryPath,
        [...pathSegments, directoryName],
        extractDescription,
      );

      return {
        directoryName,
        result: childResult,
      };
    }),
  );

  const bareCommandFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(BARE_COMMAND_EXTENSION) &&
        entry.name !== COMMAND_ENTRY_FILE &&
        entry.name !== GROUP_META_FILE &&
        !DECLARATION_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix)),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const childDirectoriesWithNodes = new Set(
    childResults.filter(({ result }) => result.hasNode).map(({ directoryName }) => directoryName),
  );

  const bareCommandNodes = await Promise.all(
    bareCommandFiles.map(async (fileName) => {
      const commandName = fileName.slice(0, -BARE_COMMAND_EXTENSION.length);

      if (childDirectoriesWithNodes.has(commandName)) {
        throw new Error(
          `Conflicting command definitions: both "${commandName}${BARE_COMMAND_EXTENSION}" and "${commandName}/" exist. A bare command file cannot coexist with a command directory.`,
        );
      }

      const sourceFilePath = path.join(absoluteDirectoryPath, fileName);

      return {
        pathSegments: [...pathSegments, commandName],
        kind: "command" as const,
        sourceFilePath,
        childNames: [] as string[],
        description: await extractDescription(sourceFilePath),
      };
    }),
  );

  const childNodes = childResults.flatMap(({ result }) => result.nodes);
  const childNames = [
    ...childResults
      .filter(({ result }) => result.hasNode)
      .map(({ directoryName }) => directoryName),
    ...bareCommandFiles.map((fileName) => fileName.slice(0, -BARE_COMMAND_EXTENSION.length)),
  ].sort((left, right) => left.localeCompare(right));

  const hasCommandEntry = entries.some(
    (entry) => entry.isFile() && entry.name === COMMAND_ENTRY_FILE,
  );

  const hasGroupMeta = entries.some((entry) => entry.isFile() && entry.name === GROUP_META_FILE);

  if (hasGroupMeta && hasCommandEntry) {
    throw new Error(
      `Conflicting definitions: both "${GROUP_META_FILE}" and "${COMMAND_ENTRY_FILE}" exist in the same directory. A directory is either a group (_group.ts) or an executable command (index.ts), not both.`,
    );
  }

  if (hasGroupMeta && childNames.length === 0) {
    throw new Error(
      `${path.join(absoluteDirectoryPath, GROUP_META_FILE)}: _group.ts exists but the directory has no subcommands.`,
    );
  }

  if (!hasCommandEntry && !hasGroupMeta && childNames.length === 0) {
    return {
      nodes: [...childNodes, ...bareCommandNodes],
      hasNode: false,
    };
  }

  let node: CommandManifestNode;

  if (hasCommandEntry) {
    const sourceFilePath = path.join(absoluteDirectoryPath, COMMAND_ENTRY_FILE);

    node = {
      pathSegments,
      kind: "command",
      sourceFilePath,
      childNames,
      description: await extractDescription(sourceFilePath),
    };
  } else {
    const groupMetaPath = path.join(absoluteDirectoryPath, GROUP_META_FILE);

    if (hasGroupMeta) {
      await validateGroupMetaFile(groupMetaPath);
    }

    const description = hasGroupMeta ? await extractDescription(groupMetaPath) : undefined;

    if (hasGroupMeta && !description) {
      throw new Error(
        `${groupMetaPath}: _group.ts must export a defineGroup() call with a non-empty "description" string.`,
      );
    }

    node = {
      pathSegments,
      kind: "group",
      childNames,
      ...(description !== undefined ? { description } : {}),
    };
  }

  return {
    nodes: [node, ...childNodes, ...bareCommandNodes],
    hasNode: true,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateCommandManifest(
  options: GenerateCommandManifestOptions,
): Promise<CommandManifest> {
  const extractDescription = options.extractDescription ?? extractDescriptionFromSourceFile;
  const walkResult = await walkCommandsDirectory(options.commandsDirectory, [], extractDescription);

  if (walkResult.nodes.length === 0) {
    throw new Error(
      "No commands found in src/commands/. Create a command file like src/commands/hello.ts or src/commands/hello/index.ts",
    );
  }

  return {
    nodes: [...walkResult.nodes].sort((left, right) =>
      comparePathSegments(left.pathSegments, right.pathSegments),
    ),
  };
}

export function serializeCommandManifest(manifest: CommandManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export { commandManifestPathToKey, createCommandManifestNodeMap };
