import type { CommandExecutionResult } from "@rune-cli/core";

import runePackageJson from "../../package.json" with { type: "json" };
import { renderRuneBuildHelp, runBuildCommand } from "./build-command";
import { renderRuneDevHelp, runDevCommand } from "./dev-command";
import { failureResult, successResult } from "./result";

interface ParsedProjectOption {
  readonly projectPath: string;
  readonly nextIndex: number;
}

function tryParseProjectOption(
  argv: readonly string[],
  index: number,
): ParsedProjectOption | CommandExecutionResult | undefined {
  const token = argv[index];

  if (token.startsWith("--project=")) {
    return { projectPath: token.slice("--project=".length), nextIndex: index + 1 };
  }

  if (token === "--project") {
    const nextToken = argv[index + 1];

    if (!nextToken) {
      return failureResult("Missing value for --project. Usage: --project <path>");
    }

    return { projectPath: nextToken, nextIndex: index + 2 };
  }

  return undefined;
}

function isHelpFlag(token: string): boolean {
  return token === "--help" || token === "-h";
}

function isVersionFlag(token: string): boolean {
  return token === "--version" || token === "-V";
}

function getRuneVersion(): string {
  return runePackageJson.version;
}

interface ParsedDevArgs {
  readonly projectPath?: string | undefined;
  readonly commandArgs: readonly string[];
}

function parseDevArgs(argv: readonly string[]): ParsedDevArgs | CommandExecutionResult {
  const commandArgs: string[] = [];
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      commandArgs.push(...argv.slice(index + 1));
      return { projectPath, commandArgs };
    }

    if (isHelpFlag(token)) {
      return successResult(renderRuneDevHelp());
    }

    const projectResult = tryParseProjectOption(argv, index);

    if (projectResult) {
      if ("exitCode" in projectResult) {
        return projectResult;
      }

      projectPath = projectResult.projectPath;
      index = projectResult.nextIndex - 1;
      continue;
    }

    commandArgs.push(token, ...argv.slice(index + 1));
    return { projectPath, commandArgs };
  }

  return { projectPath, commandArgs };
}

interface ParsedBuildArgs {
  readonly projectPath?: string | undefined;
}

function parseBuildArgs(argv: readonly string[]): ParsedBuildArgs | CommandExecutionResult {
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (isHelpFlag(token)) {
      return successResult(renderRuneBuildHelp());
    }

    const projectResult = tryParseProjectOption(argv, index);

    if (projectResult) {
      if ("exitCode" in projectResult) {
        return projectResult;
      }

      projectPath = projectResult.projectPath;
      index = projectResult.nextIndex - 1;
      continue;
    }

    return failureResult(`Unexpected argument for rune build: ${token}`);
  }

  return { projectPath };
}

export interface RunRuneCliOptions {
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
}

function renderRuneCliHelp(): string {
  return `\
Usage: rune <command>

Commands:
  build  Build a Rune project into a distributable CLI
  dev    Run a Rune project in development mode

Options:
  -h, --help     Show this help message
  -V, --version  Show the version number
`;
}

// Parses Rune's own CLI arguments and dispatches to subcommands such as `rune dev`.
export async function runRuneCli(options: RunRuneCliOptions): Promise<CommandExecutionResult> {
  const [subcommand, ...restArgs] = options.argv;

  if (!subcommand || isHelpFlag(subcommand)) {
    return successResult(renderRuneCliHelp());
  }

  if (isVersionFlag(subcommand)) {
    return successResult(`rune v${getRuneVersion()}\n`);
  }

  if (subcommand === "dev") {
    const parsedDevArgs = parseDevArgs(restArgs);

    if ("exitCode" in parsedDevArgs) {
      return parsedDevArgs;
    }

    return runDevCommand({
      rawArgs: parsedDevArgs.commandArgs,
      projectPath: parsedDevArgs.projectPath,
      cwd: options.cwd,
    });
  }

  if (subcommand === "build") {
    const parsedBuildArgs = parseBuildArgs(restArgs);

    if ("exitCode" in parsedBuildArgs) {
      return parsedBuildArgs;
    }

    return runBuildCommand({
      projectPath: parsedBuildArgs.projectPath,
      cwd: options.cwd,
    });
  }

  return failureResult(`Unknown command: ${subcommand}. Available commands: build, dev`);
}
