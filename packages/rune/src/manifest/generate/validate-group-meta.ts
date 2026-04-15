import type { Expression, Statement } from "oxc-parser";

import { readFile } from "node:fs/promises";
import { parse } from "oxc-parser";

export async function validateGroupMetaFile(sourceFilePath: string): Promise<void> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const { program } = await parse(sourceFilePath, sourceText);

  for (const statement of program.body) {
    if (statement.type !== "ExportDefaultDeclaration") {
      continue;
    }

    const expression =
      statement.declaration.type === "Identifier"
        ? findVariableInitializer(program.body, statement.declaration.name)
        : (statement.declaration as Expression);

    if (
      expression &&
      expression.type === "CallExpression" &&
      isDefineGroupCallee(expression.callee)
    ) {
      return;
    }

    throw new Error(
      `${sourceFilePath}: _group.ts must use "export default defineGroup(...)". Found a default export that is not a defineGroup() call.`,
    );
  }

  throw new Error(`${sourceFilePath}: _group.ts must have a default export using defineGroup().`);
}

function findVariableInitializer(
  statements: readonly Statement[],
  name: string,
): Expression | undefined {
  for (const statement of statements) {
    if (statement.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of statement.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === name && declarator.init) {
        return declarator.init;
      }
    }
  }

  return undefined;
}

function isDefineGroupCallee(callee: Expression): boolean {
  if (callee.type === "Identifier") {
    return callee.name === "defineGroup";
  }

  if (callee.type === "MemberExpression" && !callee.computed) {
    return callee.property.type === "Identifier" && callee.property.name === "defineGroup";
  }

  return false;
}
