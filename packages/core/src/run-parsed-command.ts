import type { CommandArgField, CommandOptionField, DefinedCommand } from "./command-types";
import type { OutputSink } from "./output";

import { executeCommand } from "./execute-command";
import { createOutput } from "./output";
import { extractJsonFlag, parseCommandArgs } from "./parse-command-args";

export interface RunParsedCommandInput {
  readonly command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
  readonly sink?: OutputSink | undefined;
}

export interface RunParsedCommandResult {
  /** Whether argv parsing succeeded. When `false`, the command did not run. */
  readonly parseOk: boolean;
  readonly exitCode: number;
  readonly errorMessage?: string | undefined;
  readonly data?: unknown;
  readonly jsonMode: boolean;
}

const defaultSink: OutputSink = {
  stdout: (message) => {
    process.stdout.write(message);
  },
  stderr: (message) => {
    process.stderr.write(message);
  },
};

/**
 * Shared command pipeline used by both the real CLI and the test harness.
 *
 * Handles `--json` flag extraction, argv parsing, and command execution for
 * a resolved leaf command. Callers are responsible for routing, module
 * loading, output presentation (JSON serialization, stderr formatting), and
 * providing an appropriate {@link OutputSink}.
 */
export async function runParsedCommand(
  input: RunParsedCommandInput,
): Promise<RunParsedCommandResult> {
  const { command, argv, cwd, sink = defaultSink } = input;

  const { jsonMode, parseArgv } = command.json
    ? extractJsonFlag(argv)
    : { jsonMode: false, parseArgv: argv };

  const output = createOutput(sink, { silentStdout: jsonMode });

  const parsed = await parseCommandArgs(command, parseArgv);

  if (!parsed.ok) {
    return {
      parseOk: false,
      exitCode: 1,
      errorMessage: parsed.error.message,
      data: undefined,
      jsonMode,
    };
  }

  const result = await executeCommand(command, {
    options: parsed.value.options,
    args: parsed.value.args,
    cwd,
    rawArgs: argv,
    jsonMode,
    output,
  });

  return {
    parseOk: true,
    exitCode: result.exitCode,
    errorMessage: result.errorMessage,
    data: result.data,
    jsonMode,
  };
}
