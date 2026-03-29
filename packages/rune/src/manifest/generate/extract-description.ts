import { readFile } from "node:fs/promises";
import ts from "typescript";

export interface CommandMetadata {
  readonly description?: string | undefined;
  readonly aliases: readonly string[];
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function getStaticStringValue(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return undefined;
}

function getStaticStringArrayValue(expression: ts.Expression): readonly string[] | undefined {
  if (!ts.isArrayLiteralExpression(expression)) {
    return undefined;
  }

  const values: string[] = [];

  for (const element of expression.elements) {
    const value = getStaticStringValue(element);

    if (value === undefined) {
      return undefined;
    }

    values.push(value);
  }

  return values;
}

function resolveExpression(expression: ts.Expression, sourceFile: ts.SourceFile): ts.Expression {
  if (ts.isIdentifier(expression)) {
    return findVariableInitializer(sourceFile, expression.text) ?? expression;
  }

  return expression;
}

function isDefineCommandExpression(expression: ts.Expression): boolean {
  return isNamedCallExpression(expression, "defineCommand");
}

export function isDefineGroupExpression(expression: ts.Expression): boolean {
  return isNamedCallExpression(expression, "defineGroup");
}

function isDefineCallExpression(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    (isDefineCommandExpression(expression.expression) ||
      isDefineGroupExpression(expression.expression))
  );
}

function extractMetadataFromCommandDefinition(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  knownMetadata: ReadonlyMap<string, CommandMetadata | undefined>,
): CommandMetadata | undefined {
  if (ts.isIdentifier(expression)) {
    return knownMetadata.get(expression.text);
  }

  if (!ts.isCallExpression(expression) || !isDefineCallExpression(expression)) {
    return undefined;
  }

  const [definition] = expression.arguments;

  if (!definition || !ts.isObjectLiteralExpression(definition)) {
    return undefined;
  }

  let description: string | undefined;
  let aliases: readonly string[] = [];

  for (const property of definition.properties) {
    let propertyName: string | undefined;
    let resolved: ts.Expression | undefined;

    // Shorthand property: `{ aliases }` is equivalent to `{ aliases: aliases }`
    if (ts.isShorthandPropertyAssignment(property)) {
      propertyName = property.name.text;
      resolved = resolveExpression(property.name, sourceFile);
    } else if (ts.isPropertyAssignment(property)) {
      propertyName = getPropertyNameText(property.name);
      resolved = resolveExpression(property.initializer, sourceFile);
    }

    if (!propertyName || !resolved) {
      continue;
    }

    if (propertyName === "description") {
      description = getStaticStringValue(resolved);
    } else if (propertyName === "aliases") {
      const extracted = getStaticStringArrayValue(resolved);

      if (extracted === undefined) {
        throw new Error(
          'Could not statically analyze aliases. Aliases must be an inline array of string literals (e.g. aliases: ["d"]).',
        );
      }

      aliases = extracted;
    }
  }

  return { description, aliases };
}

export function findVariableInitializer(
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

function isNamedCallExpression(expression: ts.Expression, name: string): boolean {
  if (ts.isIdentifier(expression)) {
    return expression.text === name;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === name;
  }

  return false;
}

export async function extractMetadataFromSourceFile(
  sourceFilePath: string,
): Promise<CommandMetadata | undefined> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const knownMetadata = new Map<string, CommandMetadata | undefined>();

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        knownMetadata.set(
          declaration.name.text,
          extractMetadataFromCommandDefinition(declaration.initializer, sourceFile, knownMetadata),
        );
      }

      continue;
    }

    if (ts.isExportAssignment(statement)) {
      return extractMetadataFromCommandDefinition(statement.expression, sourceFile, knownMetadata);
    }
  }

  return undefined;
}
