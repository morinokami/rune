import { readFile } from "node:fs/promises";
import ts from "typescript";

import { findVariableInitializer, isDefineGroupExpression } from "./extract-description";

export async function validateGroupMetaFile(sourceFilePath: string): Promise<void> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourceFilePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) || ts.isImportDeclaration(statement)) {
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
