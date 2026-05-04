import type { CommandFailure } from "../core/command-error";
import type { RuneConfig } from "../core/define-config";
import type { RunCommandPipelineResult } from "../core/run-command-pipeline";
import type { CommandManifest } from "../manifest/manifest-types";
import type { LoadCommandFn } from "../manifest/manifest-types";
import type {
  ResolvedCommandRoute,
  ResolveCommandRouteResult,
} from "../routing/resolve-command-route";

import { runCommandPipeline } from "../core/run-command-pipeline";
import { toHelpJson } from "../help/help-json";
import { renderResolvedHelp, resolveHelpData } from "../help/render-resolved-help";
import { isHelpFlag, isVersionFlag } from "../routing/framework-flags";
import { resolveCommandRoute } from "../routing/resolve-command-route";
import { defaultLoadCommand } from "./load-command";
import { loadRuneConfigSafe } from "./load-rune-config";

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
  // Already-loaded config, used by callers that need config metadata before
  // dispatching to the manifest runtime.
  readonly config?: RuneConfig | undefined;
  // Forwarded to `runCommandPipeline`. See `RunCommandPipelineInput.simulateAgent`.
  readonly simulateAgent?: boolean | undefined;
  // Environment variables used for option env fallbacks. Defaults to process.env.
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

// Resolves argv, loads only the matched leaf module, and executes it in-process.
export async function runManifestCommand(options: RunManifestCommandOptions): Promise<number> {
  try {
    if (isVersionRequest(options)) {
      process.stdout.write(`${options.cliName} v${options.version}\n`);
      return 0;
    }

    const route = resolveCommandRoute(options.manifest, options.rawArgs);
    const loadCommand = options.loadCommand ?? defaultLoadCommand;

    if (shouldShowHelp(route)) {
      return await renderHelpRoute(options, route, loadCommand);
    }

    return await runResolvedCommand(options, route, loadCommand);
  } catch (error) {
    process.stderr.write(ensureTrailingNewline(formatRuntimeError(error)));
    return 1;
  }
}

function isVersionRequest(
  options: Pick<RunManifestCommandOptions, "rawArgs" | "version">,
): options is Pick<RunManifestCommandOptions, "rawArgs"> & { readonly version: string } {
  return (
    Boolean(options.version) && options.rawArgs.length === 1 && isVersionFlag(options.rawArgs[0])
  );
}

// Route variants that should render help instead of executing a command.
type HelpRoute =
  | Exclude<ResolveCommandRouteResult, ResolvedCommandRoute>
  | (ResolvedCommandRoute & { readonly helpRequested: true });

function shouldShowHelp(route: ResolveCommandRouteResult): route is HelpRoute {
  return route.kind === "unknown" || route.kind === "group" || route.helpRequested;
}

async function renderHelpRoute(
  options: RunManifestCommandOptions,
  route: HelpRoute,
  loadCommand: LoadCommandFn,
): Promise<number> {
  if (isJsonHelpRequested(route, options.rawArgs)) {
    return renderJsonHelp(options, route, loadCommand);
  }

  return renderHumanHelp(options, route, loadCommand);
}

async function renderJsonHelp(
  options: RunManifestCommandOptions,
  route: HelpRoute,
  loadCommand: LoadCommandFn,
): Promise<number> {
  const config =
    options.config ??
    (options.configPath ? await loadRuneConfigSafe(options.configPath) : undefined);
  const resolved = await resolveHelpData({
    manifest: options.manifest,
    route,
    cliName: options.cliName,
    version: options.version,
    loadCommand,
    globalOptions: config?.options ?? [],
  });

  if (!writeJsonToStdout(toHelpJson(resolved))) {
    return 1;
  }

  return route.kind === "unknown" ? 1 : 0;
}

async function renderHumanHelp(
  options: RunManifestCommandOptions,
  route: HelpRoute,
  loadCommand: LoadCommandFn,
): Promise<number> {
  const config =
    options.config ??
    (options.configPath ? await loadRuneConfigSafe(options.configPath) : undefined);
  const output = await renderResolvedHelp({
    manifest: options.manifest,
    route,
    cliName: options.cliName,
    version: options.version,
    loadCommand,
    helpRenderer: config?.help,
    globalOptions: config?.options ?? [],
  });

  if (route.kind === "unknown") {
    process.stderr.write(ensureTrailingNewline(output));
    return 1;
  }

  process.stdout.write(output);
  return 0;
}

async function runResolvedCommand(
  options: RunManifestCommandOptions,
  route: ResolvedCommandRoute,
  loadCommand: LoadCommandFn,
): Promise<number> {
  const command = await loadCommand(route.node);
  const config =
    options.config ??
    (options.configPath ? await loadRuneConfigSafe(options.configPath) : undefined);
  const globalOptions = config?.options ?? [];
  const result = await runCommandPipeline({
    command,
    argv: route.remainingArgs,
    globalOptions,
    env: options.env ?? process.env,
    cwd: options.cwd,
    simulateAgent: options.simulateAgent,
  });

  return emitCommandResult(result);
}

function emitCommandResult(result: RunCommandPipelineResult): number {
  let exitCode = result.exitCode;

  if (result.jsonlMode) {
    if (result.error) {
      writeJsonToStderr(renderJsonError(result.error));
    }

    return exitCode;
  }

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

function isJsonHelpRequested(route: HelpRoute, rawArgs: readonly string[]): boolean {
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

function writeJsonToStderr(
  value: unknown,
  fallback: unknown = {
    error: {
      kind: "rune/unexpected",
      message: "Failed to serialize command error",
    },
  },
): boolean {
  try {
    process.stderr.write(`${JSON.stringify(value)}\n`);
    return true;
  } catch {
    process.stderr.write(`${JSON.stringify(fallback)}\n`);
    return false;
  }
}
