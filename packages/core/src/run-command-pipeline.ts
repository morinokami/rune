import type { CommandArgField, CommandOptionField, DefinedCommand } from "./command-types";
import type { OutputSink } from "./output";

import { addCamelCaseAliases, normalizeToCanonicalKeys } from "./camel-case-aliases";
import { createOutput } from "./output";
import { extractJsonFlag, parseCommandArgs } from "./parse-command-args";
import { isSchemaField } from "./schema-field";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunCommandPipelineInput {
  readonly command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
  readonly sink?: OutputSink | undefined;
}

export interface RunCommandPipelineResult {
  /** Whether argv parsing succeeded. When `false`, the command did not run. */
  readonly parseOk: boolean;
  readonly exitCode: number;
  readonly errorMessage?: string | undefined;
  readonly data?: unknown;
  readonly jsonMode: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const defaultSink: OutputSink = {
  stdout: (message) => {
    process.stdout.write(message);
  },
  stderr: (message) => {
    process.stderr.write(message);
  },
};

function formatExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message === "" ? "" : error.message || error.name || "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function normalizeOptions(
  fields: readonly CommandOptionField[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const options: Record<string, unknown> = { ...raw };

  normalizeToCanonicalKeys(fields, options);

  for (const field of fields) {
    if (options[field.name] === undefined && !isSchemaField(field) && field.type === "boolean") {
      options[field.name] = false;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shared command pipeline used by both the real CLI and the test harness.
 *
 * Handles `--json` flag extraction, argv parsing, and command execution for
 * a resolved leaf command. Callers are responsible for routing, module
 * loading, output presentation (JSON serialization, stderr formatting), and
 * providing an appropriate {@link OutputSink}.
 */
export async function runCommandPipeline(
  input: RunCommandPipelineInput,
): Promise<RunCommandPipelineResult> {
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

  try {
    const options = addCamelCaseAliases(
      normalizeOptions(command.options, parsed.value.options as Record<string, unknown>),
    );
    const args = addCamelCaseAliases(
      normalizeToCanonicalKeys(command.args, { ...parsed.value.args } as Record<string, unknown>),
    );

    // The `command.run` signature is generic, but at this layer we operate on
    // erased `DefinedCommand` instances. The casts above produce the shapes
    // that `command.run` expects at runtime; TypeScript cannot verify this
    // statically, so we use `as never` to satisfy the call-site constraint.
    const data = await (
      command as DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>
    ).run({
      options: options as never,
      args: args as never,
      cwd: cwd ?? process.cwd(),
      rawArgs: argv,
      output,
    });

    return {
      parseOk: true,
      exitCode: 0,
      data,
      jsonMode,
    };
  } catch (error) {
    const message = formatExecutionError(error);

    return message
      ? {
          parseOk: true,
          exitCode: 1,
          errorMessage: message,
          data: undefined,
          jsonMode,
        }
      : { parseOk: true, exitCode: 1, data: undefined, jsonMode };
  }
}
