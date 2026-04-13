const COMMAND_ALIAS_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCommandAliases(aliases: readonly string[]): void {
  const seen = new Set<string>();

  for (const alias of aliases) {
    if (!COMMAND_ALIAS_RE.test(alias)) {
      throw new Error(
        `Invalid command alias "${alias}". Aliases must be lowercase kebab-case (letters, digits, and internal hyphens).`,
      );
    }

    if (seen.has(alias)) {
      throw new Error(`Duplicate command alias "${alias}".`);
    }

    seen.add(alias);
  }
}
