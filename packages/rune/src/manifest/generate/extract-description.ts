import { readFile } from "node:fs/promises";
import ts from "typescript";

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
