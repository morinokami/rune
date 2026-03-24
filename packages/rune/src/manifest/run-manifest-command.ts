import { executeCommand, parseCommand } from "@rune-cli/core";

import type { CommandManifest } from "./manifest-types";

import { isVersionFlag } from "../cli/flags";
import { defaultLoadCommand, renderResolvedHelp, type LoadCommandFn } from "./render-help";
import { resolveCommandPath } from "./resolve-command-path";

export interface RunManifestCommandOptions {
  readonly manifest: CommandManifest;
  readonly rawArgs: readonly string[];
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly cwd?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

// Resolves argv, loads only the matched leaf module, and executes it in-process.
export async function runManifestCommand(options: RunManifestCommandOptions): Promise<number> {
  if (options.version && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
    process.stdout.write(`${options.cliName} v${options.version}\n`);
    return 0;
  }

  const route = resolveCommandPath(options.manifest, options.rawArgs);

  if (route.kind === "unknown" || route.kind === "group" || route.helpRequested) {
    const output = await renderResolvedHelp({
      manifest: options.manifest,
      route,
      cliName: options.cliName,
      version: options.version,
      loadCommand: options.loadCommand,
    });

    if (route.kind === "unknown") {
      process.stderr.write(ensureTrailingNewline(output));
      return 1;
    }

    process.stdout.write(output);
    return 0;
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const command = await loadCommand(route.node);
  const parsed = await parseCommand(command, route.remainingArgs);

  if (!parsed.ok) {
    process.stderr.write(ensureTrailingNewline(parsed.error.message));
    return 1;
  }

  const result = await executeCommand(command, {
    options: parsed.value.options,
    args: parsed.value.args,
    cwd: options.cwd,
    rawArgs: parsed.value.rawArgs,
  });

  if (result.errorMessage) {
    process.stderr.write(ensureTrailingNewline(result.errorMessage));
  }

  return result.exitCode;
}
