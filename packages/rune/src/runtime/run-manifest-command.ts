import type { CommandFailure } from "../core/command-error";
import type { CommandManifest } from "../manifest/manifest-types";

import { isHelpFlag, isVersionFlag } from "../cli/flags";
import { runCommandPipeline } from "../core/run-command-pipeline";
import { toHelpJson } from "../help/help-json";
import { renderResolvedHelp, resolveHelpData } from "../help/render-resolved-help";
import { resolveCommandRoute } from "../routing/resolve-command-route";
import { defaultLoadCommand, type LoadCommandFn } from "./load-command";

export interface RunManifestCommandOptions {
  readonly manifest: CommandManifest;
  readonly rawArgs: readonly string[];
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly cwd?: string | undefined;
  // Overrides the default file-based module loader, mainly for testing.
  readonly loadCommand?: LoadCommandFn | undefined;
  // Path to the rune.config.ts (or built config.mjs) module. Loaded lazily
  // only when help rendering is needed.
  readonly configPath?: string | undefined;
  // Forwarded to `runCommandPipeline`. See `RunCommandPipelineInput.simulateAgent`.
  readonly simulateAgent?: boolean | undefined;
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

function renderHumanError(error: CommandFailure): string {
  const lines = [error.message];

  if (error.hint) {
    lines.push(`Hint: ${error.hint}`);
  }

  return lines.join("\n");
}

function getSerializableDetails(error: CommandFailure): unknown {
  if (error.details === undefined) {
    return undefined;
  }

  try {
    JSON.stringify(error.details);
    return error.details;
  } catch {
    return undefined;
  }
}

function renderJsonError(error?: CommandFailure): {
  readonly error: Record<string, unknown>;
} {
  if (!error) {
    return {
      error: {
        kind: "rune/unexpected",
        message: "Command failed",
      },
    };
  }

  const details = getSerializableDetails(error);

  return {
    error: {
      kind: error.kind,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}

function hasTokenBeforeTerminator(
  args: readonly string[],
  predicate: (token: string) => boolean,
): boolean {
  for (const token of args) {
    if (token === "--") {
      return false;
    }

    if (predicate(token)) {
      return true;
    }
  }

  return false;
}

function isJsonFlag(token: string): boolean {
  return token === "--json";
}

function isHelpJsonRequested(
  route: ReturnType<typeof resolveCommandRoute>,
  rawArgs: readonly string[],
): boolean {
  if (route.kind === "unknown") {
    return (
      hasTokenBeforeTerminator(rawArgs, isHelpFlag) && hasTokenBeforeTerminator(rawArgs, isJsonFlag)
    );
  }

  return route.helpRequested && hasTokenBeforeTerminator(route.remainingArgs, isJsonFlag);
}

function writeJsonToStdout(
  value: unknown,
  fallback: unknown = {
    error: {
      kind: "rune/unexpected",
      message: "Failed to serialize command output",
    },
  },
): boolean {
  try {
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return true;
  } catch {
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
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
    const helpJsonRequested = isHelpJsonRequested(route, options.rawArgs);

    if (route.kind === "unknown" || route.kind === "group" || route.helpRequested) {
      if (helpJsonRequested) {
        const resolved = await resolveHelpData({
          manifest: options.manifest,
          route,
          cliName: options.cliName,
          version: options.version,
          loadCommand: options.loadCommand,
        });

        if (!writeJsonToStdout(toHelpJson(resolved))) {
          return 1;
        }

        return route.kind === "unknown" ? 1 : 0;
      }

      const output = await renderResolvedHelp({
        manifest: options.manifest,
        route,
        cliName: options.cliName,
        version: options.version,
        loadCommand: options.loadCommand,
        configPath: options.configPath,
      });

      if (route.kind === "unknown") {
        process.stderr.write(ensureTrailingNewline(output));
        return 1;
      }

      process.stdout.write(output);
      return 0;
    }

    const loadCommandFn = options.loadCommand ?? defaultLoadCommand;
    const command = await loadCommandFn(route.node);

    const result = await runCommandPipeline({
      command,
      argv: route.remainingArgs,
      cwd: options.cwd,
      simulateAgent: options.simulateAgent,
    });

    let exitCode = result.exitCode;

    if (result.jsonMode) {
      if (result.exitCode === 0) {
        const payload = result.data === undefined ? null : result.data;
        if (!writeJsonToStdout(payload)) {
          exitCode = 1;
        }
      } else {
        writeJsonToStdout(renderJsonError(result.error));
      }
    }

    if (!result.jsonMode && result.error) {
      const renderedError = renderHumanError(result.error);

      if (renderedError !== "") {
        process.stderr.write(ensureTrailingNewline(renderedError));
      }
    }

    return exitCode;
  } catch (error) {
    process.stderr.write(ensureTrailingNewline(formatRuntimeError(error)));
    return 1;
  }
}
