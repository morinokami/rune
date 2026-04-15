import type {
  ExportDefaultDeclarationKind,
  Expression,
  ObjectProperty,
  PropertyKey,
  Statement,
} from "oxc-parser";

import { readFile } from "node:fs/promises";
import { parse } from "oxc-parser";

export interface CommandMetadata {
  readonly description?: string | undefined;
  readonly aliases: readonly string[];
  readonly examples: readonly string[];
}

function getPropertyNameText(key: PropertyKey, computed: boolean): string | undefined {
  if (computed) {
    return undefined;
  }

  if (key.type === "Identifier") {
    return key.name;
  }

  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value;
  }

  return undefined;
}

function getStaticStringValue(expression: Expression): string | undefined {
  if (expression.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }

  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions.length === 0 &&
    expression.quasis.length === 1
  ) {
    return expression.quasis[0].value.cooked ?? undefined;
  }

  return undefined;
}

function getStaticStringArrayValue(expression: Expression): readonly string[] | undefined {
  if (expression.type !== "ArrayExpression") {
    return undefined;
  }

  const values: string[] = [];

  for (const element of expression.elements) {
    if (element === null || element.type === "SpreadElement") {
      return undefined;
    }

    const value = getStaticStringValue(element);

    if (value === undefined) {
      return undefined;
    }

    values.push(value);
  }

  return values;
}

function resolveExpression(
  expression: Expression,
  statements: readonly Statement[],
): Expression | undefined {
  if (expression.type === "Identifier") {
    return findVariableInitializer(statements, expression.name) ?? expression;
  }

  return expression;
}

function isDefineCommandExpression(expression: Expression): boolean {
  return isNamedCallExpression(expression, "defineCommand");
}

function isDefineGroupExpression(expression: Expression): boolean {
  return isNamedCallExpression(expression, "defineGroup");
}

function isDefineCallExpression(expression: Expression): boolean {
  return (
    expression.type === "CallExpression" &&
    (isDefineCommandExpression(expression.callee) || isDefineGroupExpression(expression.callee))
  );
}

function extractMetadataFromCommandDefinition(
  expression: Expression,
  statements: readonly Statement[],
  knownMetadata: ReadonlyMap<string, CommandMetadata | undefined>,
): CommandMetadata | undefined {
  if (expression.type === "Identifier") {
    return knownMetadata.get(expression.name);
  }

  if (expression.type !== "CallExpression" || !isDefineCallExpression(expression)) {
    return undefined;
  }

  const isGroup = isDefineGroupExpression(expression.callee);
  const [definition] = expression.arguments;

  if (!definition || definition.type !== "ObjectExpression") {
    return undefined;
  }

  let description: string | undefined;
  let aliases: readonly string[] = [];
  let examples: readonly string[] = [];

  for (const property of definition.properties) {
    if (property.type !== "Property") {
      continue;
    }

    const propertyName = getPropertyNameText(property.key, property.computed);

    if (propertyName === undefined) {
      continue;
    }

    const resolved = resolvePropertyValue(property, statements);

    if (!resolved) {
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
    } else if (propertyName === "examples") {
      const extracted = getStaticStringArrayValue(resolved);

      // Group help renders from manifest metadata only, so examples must be
      // statically analyzable. Command help loads the module at runtime, so
      // dynamic expressions (e.g. `examples: makeExamples()`) are fine — we
      // simply skip them here.
      if (extracted === undefined && isGroup) {
        throw new Error(
          'Could not statically analyze examples. Examples must be an inline array of string literals (e.g. examples: ["my-cli project create"]).',
        );
      }

      if (extracted !== undefined) {
        examples = extracted;
      }
    }
  }

  return { description, aliases, examples };
}

function resolvePropertyValue(
  property: ObjectProperty,
  statements: readonly Statement[],
): Expression | undefined {
  // Shorthand property: `{ aliases }` is equivalent to `{ aliases: aliases }`.
  // In oxc AST, shorthand sets both `key` and `value` to the same Identifier node.
  if (property.shorthand && property.key.type === "Identifier") {
    return findVariableInitializer(statements, property.key.name) ?? property.value;
  }

  return resolveExpression(property.value, statements);
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

function isNamedCallExpression(expression: Expression, name: string): boolean {
  if (expression.type === "Identifier") {
    return expression.name === name;
  }

  if (expression.type === "MemberExpression" && !expression.computed) {
    return expression.property.type === "Identifier" && expression.property.name === name;
  }

  return false;
}

export async function extractMetadataFromSourceFile(
  sourceFilePath: string,
): Promise<CommandMetadata | undefined> {
  const sourceText = await readFile(sourceFilePath, "utf8");
  const { program } = await parse(sourceFilePath, sourceText);
  const knownMetadata = new Map<string, CommandMetadata | undefined>();

  for (const statement of program.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== "Identifier" || !declaration.init) {
          continue;
        }

        knownMetadata.set(
          declaration.id.name,
          extractMetadataFromCommandDefinition(declaration.init, program.body, knownMetadata),
        );
      }

      continue;
    }

    if (statement.type === "ExportDefaultDeclaration") {
      if (isExpression(statement.declaration)) {
        return extractMetadataFromCommandDefinition(
          statement.declaration,
          program.body,
          knownMetadata,
        );
      }

      return undefined;
    }
  }

  return undefined;
}

function isExpression(node: ExportDefaultDeclarationKind): node is Expression {
  return (
    node.type !== "FunctionDeclaration" &&
    node.type !== "ClassDeclaration" &&
    node.type !== "TSInterfaceDeclaration"
  );
}
