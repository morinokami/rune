import { pathToFileURL } from "node:url";

import { isRuneConfig, type RuneConfig } from "../core/define-config";

export async function loadRuneConfig(
  configPath: string,
  label = "rune.config.ts",
): Promise<RuneConfig> {
  const moduleUrl = pathToFileURL(configPath).href;
  const loadedConfigModule = (await import(moduleUrl)) as { default?: unknown };

  if (!loadedConfigModule.default || !isRuneConfig(loadedConfigModule.default)) {
    throw new Error(`${label} does not export a valid defineConfig() default export.`);
  }

  return loadedConfigModule.default;
}

export interface LoadRuneConfigSafeOptions {
  readonly label?: string | undefined;
}

/**
 * Loads a Rune config module from the given path. Returns `undefined` on
 * failure and writes a warning to stderr so that help output still works
 * even when the config is broken.
 */
export async function loadRuneConfigSafe(
  configPath: string,
  options: LoadRuneConfigSafeOptions = {},
): Promise<RuneConfig | undefined> {
  const label = options.label ?? "rune.config.ts";

  try {
    return await loadRuneConfig(configPath, label);
  } catch {
    process.stderr.write(`Warning: Failed to load ${label}.\n`);
    return undefined;
  }
}
