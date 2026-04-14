import { isHelpFlag } from "./flags";
import {
  getRuneManagedOptionNextIndex,
  tryConsumeRuneManagedOption,
  type EarlyExit,
} from "./rune-options";

export interface ParsedRunArgs {
  readonly ok: true;
  readonly projectPath?: string | undefined;
  readonly commandArgs: readonly string[];
}

export interface ParsedBuildArgs {
  readonly ok: true;
  readonly projectPath?: string | undefined;
}

// Scans only the Rune-managed prefix of remainingArgs for --help.
// Stops at the first non-Rune token (a positional or unknown option), so that
// `rune run hello --help` passes --help through to the user's command and
// `rune build foo --help` correctly reports an error instead of showing help.
export function isRuneHelpRequested(remainingArgs: readonly string[]): boolean {
  for (let index = 0; index < remainingArgs.length; index += 1) {
    const token = remainingArgs[index];

    if (isHelpFlag(token)) {
      return true;
    }

    const nextIndex = getRuneManagedOptionNextIndex(remainingArgs, index);

    if (nextIndex !== undefined) {
      index = nextIndex - 1;
      continue;
    }

    return false;
  }

  return false;
}

export function parseRunArgs(argv: readonly string[]): ParsedRunArgs | EarlyExit {
  const commandArgs: string[] = [];
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      commandArgs.push(...argv.slice(index + 1));
      return { ok: true, projectPath, commandArgs };
    }

    const managedOption = tryConsumeRuneManagedOption(argv, index);

    if (managedOption) {
      if (!managedOption.ok) {
        return managedOption;
      }

      if (managedOption.name === "project") {
        projectPath = managedOption.value;
      }

      index = managedOption.nextIndex - 1;
      continue;
    }

    commandArgs.push(token, ...argv.slice(index + 1));
    return { ok: true, projectPath, commandArgs };
  }

  return { ok: true, projectPath, commandArgs };
}

export function parseBuildArgs(argv: readonly string[]): ParsedBuildArgs | EarlyExit {
  let projectPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const managedOption = tryConsumeRuneManagedOption(argv, index);

    if (managedOption) {
      if (!managedOption.ok) {
        return managedOption;
      }

      if (managedOption.name === "project") {
        projectPath = managedOption.value;
      }

      index = managedOption.nextIndex - 1;
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
