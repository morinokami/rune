import { pathToFileURL } from "node:url";

import { isRuneConfig, type RuneConfig } from "../../define-config";

/**
 * Loads a Rune config module from the given path. Returns `undefined` on
 * failure and writes a warning to stderr so that help output still works
 * even when the config is broken.
 */
export async function loadRuneConfigSafe(configPath: string): Promise<RuneConfig | undefined> {
  try {
    const moduleUrl = pathToFileURL(configPath).href;
    const module = (await import(moduleUrl)) as { default?: unknown };

    if (!module.default || !isRuneConfig(module.default)) {
      process.stderr.write(
        "Warning: rune.config.ts does not export a valid defineConfig() default export.\n",
      );
      return undefined;
    }

    return module.default;
  } catch {
    process.stderr.write("Warning: Failed to load rune.config.ts.\n");
    return undefined;
  }
}
