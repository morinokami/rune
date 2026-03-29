import runePackageJson from "../../package.json" with { type: "json" };
import { renderRuneBuildHelp, runBuildCommand } from "./build-command";
import { isHelpFlag, isVersionFlag } from "./flags";
import { renderRuneRunHelp, runRunCommand } from "./run-command";
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
// Help rendering
// ---------------------------------------------------------------------------

function renderRuneCliHelp(): string {
  return `\
Usage: rune <command>

Commands:
  build  Build a Rune project into a distributable CLI
  run    Run a Rune project directly from source

Options:
  -h, --help     Show this help message
  -V, --version  Show the version number
`;
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

    if (isHelpFlag(token)) {
      return { ok: false, exitCode: 0, output: renderRuneRunHelp(), stream: "stdout" };
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

    if (isHelpFlag(token)) {
      return { ok: false, exitCode: 0, output: renderRuneBuildHelp(), stream: "stdout" };
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
  const [subcommand, ...restArgs] = options.argv;

  if (!subcommand || isHelpFlag(subcommand)) {
    await writeStdout(renderRuneCliHelp());
    return 0;
  }

  if (isVersionFlag(subcommand)) {
    await writeStdout(`rune v${getRuneVersion()}\n`);
    return 0;
  }

  if (subcommand === "run") {
    return runRunSubcommand(options, restArgs);
  }

  if (subcommand === "build") {
    return runBuildSubcommand(options, restArgs);
  }

  await writeStderrLine(`Unknown command: ${subcommand}. Available commands: build, run`);
  return 1;
}
