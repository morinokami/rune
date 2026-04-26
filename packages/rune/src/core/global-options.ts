import type { CommandOptionField } from "./field-types";

import { kebabToCamelCase } from "./camel-case-aliases";
import { isEnumField } from "./enum-field";
import { isSchemaField } from "./schema-field";

export async function validateConfigOptionsForSync(
  options: readonly CommandOptionField[],
): Promise<void> {
  for (const field of options) {
    if (isSchemaField(field)) {
      const omitted = await field.schema["~standard"].validate(undefined);

      if (!("value" in omitted)) {
        throw new Error(`Config option "${field.name}" must be optional.`);
      }
    }
  }
}

export function validateGlobalOptionsForCommand(
  globalOptions: readonly CommandOptionField[],
  command: { readonly options: readonly CommandOptionField[] },
): void {
  validateMergedOptionNames(globalOptions, command.options);
  validateMergedOptionShortNames(globalOptions, command.options);
  validateMergedNegationCollisions(globalOptions, command.options);
}

function validateMergedOptionNames(
  globalOptions: readonly CommandOptionField[],
  localOptions: readonly CommandOptionField[],
): void {
  const seen = new Map<string, "global" | "local">();

  for (const [scope, options] of [
    ["global", globalOptions],
    ["local", localOptions],
  ] as const) {
    for (const field of options) {
      for (const name of optionNameAliases(field.name)) {
        const previousScope = seen.get(name);

        if (previousScope !== undefined) {
          throw new Error(
            `Option "${field.name}" conflicts with an existing ${previousScope} option name or alias "${name}".`,
          );
        }

        seen.set(name, scope);
      }
    }
  }
}

function validateMergedOptionShortNames(
  globalOptions: readonly CommandOptionField[],
  localOptions: readonly CommandOptionField[],
): void {
  const seen = new Map<string, "global" | "local">();

  for (const [scope, options] of [
    ["global", globalOptions],
    ["local", localOptions],
  ] as const) {
    for (const field of options) {
      if (field.short === undefined) {
        continue;
      }

      const previousScope = seen.get(field.short);

      if (previousScope !== undefined) {
        throw new Error(
          `Short name "${field.short}" for option "${field.name}" conflicts with an existing ${previousScope} option.`,
        );
      }

      seen.set(field.short, scope);
    }
  }
}

function validateMergedNegationCollisions(
  globalOptions: readonly CommandOptionField[],
  localOptions: readonly CommandOptionField[],
): void {
  const options = [...globalOptions, ...localOptions];
  const names = new Set(options.map((field) => field.name));

  for (const field of options) {
    if (!isNegatableOption(field)) {
      continue;
    }

    const negatedName = `no-${field.name}`;

    if (names.has(negatedName)) {
      throw new Error(
        `Option "${negatedName}" conflicts with the automatic negation of boolean option "${field.name}".`,
      );
    }
  }
}

function optionNameAliases(name: string): readonly string[] {
  return name.includes("-") ? [name, kebabToCamelCase(name)] : [name];
}

function isNegatableOption(field: CommandOptionField): boolean {
  return (
    !isSchemaField(field) &&
    !isEnumField(field) &&
    field.type === "boolean" &&
    field.default === true
  );
}
