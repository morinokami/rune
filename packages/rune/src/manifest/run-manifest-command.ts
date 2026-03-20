import { executeCommand, parseCommand, type CommandExecutionResult } from "@rune-cli/core";

import type { CommandManifest } from "./manifest-types";

import { failureResult, successResult } from "../cli/result";
import { defaultLoadCommand, renderResolvedHelp, type LoadCommandFn } from "./render-help";
import { resolveCommandPath } from "./resolve-command-path";

export interface RunManifestCommandOptions {
  readonly manifest: CommandManifest;
  readonly rawArgs: readonly string[];
  readonly cliName: string;
  readonly cwd?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

// Resolves argv, loads only the matched leaf module, and executes it in-process.
export async function runManifestCommand(
  options: RunManifestCommandOptions,
): Promise<CommandExecutionResult> {
  const route = resolveCommandPath(options.manifest, options.rawArgs);

  if (route.kind === "unknown" || route.kind === "group" || route.helpRequested) {
    const output = await renderResolvedHelp({
      manifest: options.manifest,
      route,
      cliName: options.cliName,
      loadCommand: options.loadCommand,
    });

    return route.kind === "unknown" ? failureResult(output) : successResult(output);
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const command = await loadCommand(route.node);
  const parsed = await parseCommand(command, route.remainingArgs);

  if (!parsed.ok) {
    return failureResult(parsed.error.message);
  }

  return executeCommand(command, {
    options: parsed.value.options,
    args: parsed.value.args,
    cwd: options.cwd,
    rawArgs: parsed.value.rawArgs,
  });
}
