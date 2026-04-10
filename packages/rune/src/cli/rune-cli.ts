import runePackageJson from "../../package.json" with { type: "json" };
import { buildUnknownCommandHelpData } from "../manifest/runtime/help-data";
import { renderDefaultHelp } from "../manifest/runtime/render-help";
import { resolveCommandRoute } from "../manifest/runtime/resolve-command-route";
import { renderResolvedHelp } from "../manifest/runtime/resolve-help";
import { runBuildCommand } from "./build-command";
import { isHelpFlag, isVersionFlag } from "./flags";
import { runRunCommand } from "./run-command";
import { createRuneCliManifest, loadRuneCommand } from "./rune-manifest";
import { writeStderrLine, writeStdout } from "./write-result";

// ---------------------------------------------------------------------------
// Shared parsing types
// ---------------------------------------------------------------------------

interface ParsedProjectOption {
  readonly ok: true;
  readonly projectPath: string;
  readonly nextIndex: number;
}

interface EarlyExit {
  readonly ok: false;
  readonly exitCode: number;
  readonly output: string;
  readonly stream: "stdout" | "stderr";
}

interface ParsedRunArgs {
  readonly ok: true;
  readonly projectPath?: string | undefined;
  readonly commandArgs: readonly string[];
}

interface ParsedBuildArgs {
  readonly ok: true;
  readonly projectPath?: string | undefined;
}

export interface RunRuneCliOptions {
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
}

// ---------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------

async function writeEarlyExit(exit: EarlyExit): Promise<number> {
  if (exit.stream === "stdout") {
    await writeStdout(exit.output);
  } else {
    await writeStderrLine(exit.output);
  }

  return exit.exitCode;
}

function tryParseProjectOption(
  argv: readonly string[],
  index: number,
): ParsedProjectOption | EarlyExit | undefined {
  const token = argv[index];

  if (token.startsWith("--project=")) {
    return { ok: true, projectPath: token.slice("--project=".length), nextIndex: index + 1 };
  }

  if (token === "--project") {
    const nextToken = argv[index + 1];

    if (!nextToken) {
      return {
        ok: false,
        exitCode: 1,
        output: "Missing value for --project. Usage: --project <path>",
        stream: "stderr",
      };
    }

    return { ok: true, projectPath: nextToken, nextIndex: index + 2 };
  }

  return undefined;
}

function getRuneVersion(): string {
  return runePackageJson.version;
}

// ---------------------------------------------------------------------------
// Help request detection for Rune subcommands
// ---------------------------------------------------------------------------

// Scans only the Rune-managed prefix of remainingArgs for --help.
// Stops at the first non-Rune token (a positional or unknown option), so that
// `rune run hello --help` passes --help through to the user's command and
// `rune build foo --help` correctly reports an error instead of showing help.
function isRuneHelpRequested(remainingArgs: readonly string[]): boolean {
  for (let i = 0; i < remainingArgs.length; i++) {
    const token = remainingArgs[i];

    if (isHelpFlag(token)) {
      return true;
    }

    if (token === "--project") {
      i += 1;
      continue;
    }

    if (token.startsWith("--project=")) {
      continue;
    }

    // Any other token (positional or unknown option) starts passthrough.
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Subcommand argument parsing
// ---------------------------------------------------------------------------

function parseRunArgs(argv: readonly string[]): ParsedRunArgs | EarlyExit {
  const commandArgs: string[] = [];
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      commandArgs.push(...argv.slice(index + 1));
      return { ok: true, projectPath, commandArgs };
    }

    const projectResult = tryParseProjectOption(argv, index);

    if (projectResult) {
      if (!projectResult.ok) {
        return projectResult;
      }

      projectPath = projectResult.projectPath;
      index = projectResult.nextIndex - 1;
      continue;
    }

    commandArgs.push(token, ...argv.slice(index + 1));
    return { ok: true, projectPath, commandArgs };
  }

  return { ok: true, projectPath, commandArgs };
}

function parseBuildArgs(argv: readonly string[]): ParsedBuildArgs | EarlyExit {
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    const projectResult = tryParseProjectOption(argv, index);

    if (projectResult) {
      if (!projectResult.ok) {
        return projectResult;
      }

      projectPath = projectResult.projectPath;
      index = projectResult.nextIndex - 1;
      continue;
    }

    return {
      ok: false,
      exitCode: 1,
      output: `Unexpected argument for rune build: ${token}`,
      stream: "stderr",
    };
  }

  return { ok: true, projectPath };
}

// ---------------------------------------------------------------------------
// Subcommand dispatch
// ---------------------------------------------------------------------------

async function runRunSubcommand(
  options: RunRuneCliOptions,
  restArgs: readonly string[],
): Promise<number> {
  const parsedRunArgs = parseRunArgs(restArgs);

  if (!parsedRunArgs.ok) {
    return writeEarlyExit(parsedRunArgs);
  }

  return runRunCommand({
    rawArgs: parsedRunArgs.commandArgs,
    projectPath: parsedRunArgs.projectPath,
    cwd: options.cwd,
  });
}

async function runBuildSubcommand(
  options: RunRuneCliOptions,
  restArgs: readonly string[],
): Promise<number> {
  const parsedBuildArgs = parseBuildArgs(restArgs);

  if (!parsedBuildArgs.ok) {
    return writeEarlyExit(parsedBuildArgs);
  }

  return runBuildCommand({
    projectPath: parsedBuildArgs.projectPath,
    cwd: options.cwd,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Parses Rune's own CLI arguments and dispatches to subcommands such as `rune run`.
export async function runRuneCli(options: RunRuneCliOptions): Promise<number> {
  const manifest = createRuneCliManifest();
  const route = resolveCommandRoute(manifest, options.argv);

  if (route.kind === "unknown") {
    const helpData = buildUnknownCommandHelpData(route, "rune", manifest, getRuneVersion());
    await writeStderrLine(renderDefaultHelp(helpData));
    return 1;
  }

  if (route.kind === "group") {
    if (route.remainingArgs.length === 1 && isVersionFlag(route.remainingArgs[0])) {
      await writeStdout(`rune v${getRuneVersion()}\n`);
      return 0;
    }

    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "rune",
      version: getRuneVersion(),
      loadCommand: loadRuneCommand,
    });
    await writeStdout(help);
    return 0;
  }

  const commandName = route.node.pathSegments.at(-1);

  if (commandName === "build") {
    if (isRuneHelpRequested(route.remainingArgs)) {
      const help = await renderResolvedHelp({
        manifest,
        route,
        cliName: "rune",
        loadCommand: loadRuneCommand,
      });
      await writeStdout(help);
      return 0;
    }

    return runBuildSubcommand(options, route.remainingArgs);
  }

  if (commandName === "run") {
    if (isRuneHelpRequested(route.remainingArgs)) {
      const help = await renderResolvedHelp({
        manifest,
        route,
        cliName: "rune",
        loadCommand: loadRuneCommand,
      });
      await writeStdout(help);
      return 0;
    }

    return runRunSubcommand(options, route.remainingArgs);
  }

  return 1;
}
