import { runCommandPipeline } from "@rune-cli/core";

import type { CommandManifest } from "../manifest-types";

import { isVersionFlag } from "../../cli/flags";
import { defaultLoadCommand, type LoadCommandFn } from "./command-loader";
import { resolveCommandRoute } from "./resolve-command-route";
import { renderResolvedHelp } from "./resolve-help";

export interface RunManifestCommandOptions {
  readonly manifest: CommandManifest;
  readonly rawArgs: readonly string[];
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly cwd?: string | undefined;
  // Overrides the default file-based module loader, mainly for testing.
  readonly loadCommand?: LoadCommandFn | undefined;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || "Failed to run command";
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Failed to run command";
}

function writeJsonToStdout(value: unknown): boolean {
  try {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return true;
  } catch {
    process.stdout.write(
      `${JSON.stringify({ error: "Failed to serialize command output" }, null, 2)}\n`,
    );
    process.stderr.write("Failed to serialize command output\n");
    return false;
  }
}

// Resolves argv, loads only the matched leaf module, and executes it in-process.
export async function runManifestCommand(options: RunManifestCommandOptions): Promise<number> {
  try {
    if (options.version && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])) {
      process.stdout.write(`${options.cliName} v${options.version}\n`);
      return 0;
    }

    const route = resolveCommandRoute(options.manifest, options.rawArgs);

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

    const result = await runCommandPipeline({
      command,
      argv: route.remainingArgs,
      cwd: options.cwd,
    });

    let exitCode = result.exitCode;

    if (result.jsonMode) {
      if (result.exitCode === 0) {
        const payload = result.data === undefined ? null : result.data;
        if (!writeJsonToStdout(payload)) {
          exitCode = 1;
        }
      } else {
        writeJsonToStdout({ error: result.errorMessage ?? "Command failed" });
      }
    }

    if (result.errorMessage) {
      process.stderr.write(ensureTrailingNewline(result.errorMessage));
    }

    return exitCode;
  } catch (error) {
    process.stderr.write(ensureTrailingNewline(formatRuntimeError(error)));
    return 1;
  }
}
