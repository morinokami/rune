import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import type { CommandManifest, CommandManifestNode, CommandManifestPath } from "./manifest-types";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "./manifest-map";

const COMMAND_ENTRY_FILE = "index.ts";

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

function isDefineCommandExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === "defineCommand";
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === "defineCommand";
  }

  return false;
}

function extractDescriptionFromCommandDefinition(
  expression: ts.Expression,
  knownDescriptions: ReadonlyMap<string, string | undefined>,
): string | undefined {
  if (ts.isIdentifier(expression)) {
    return knownDescriptions.get(expression.text);
  }

  if (!ts.isCallExpression(expression) || !isDefineCommandExpression(expression.expression)) {
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

  const childNodes = childResults.flatMap(({ result }) => result.nodes);
  const childNames = childResults
    .filter(({ result }) => result.hasNode)
    .map(({ directoryName }) => directoryName);

  const hasCommandEntry = entries.some(
    (entry) => entry.isFile() && entry.name === COMMAND_ENTRY_FILE,
  );

  if (!hasCommandEntry && childNames.length === 0) {
    return {
      nodes: childNodes,
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
    node = {
      pathSegments,
      kind: "group",
      childNames,
    };
  }

  return {
    nodes: [node, ...childNodes],
    hasNode: true,
  };
}

export async function generateCommandManifest(
  options: GenerateCommandManifestOptions,
): Promise<CommandManifest> {
  const extractDescription = options.extractDescription ?? extractDescriptionFromSourceFile;
  const walkResult = await walkCommandsDirectory(options.commandsDirectory, [], extractDescription);

  if (walkResult.nodes.length === 0) {
    throw new Error(
      "No commands found in src/commands/. Create a command file like src/commands/hello/index.ts",
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
