import type { CommandArgField, CommandOptionField, DefinedCommand } from "./command-types";
import type { OutputSink } from "./output";

import { addCamelCaseAliases, normalizeToCanonicalKeys } from "./camel-case-aliases";
import { CommandError, type CommandFailure } from "./command-error";
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
  readonly error?: CommandFailure | undefined;
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

const INVALID_ARGUMENTS_ERROR_KIND = "invalid-arguments";
const INTERNAL_ERROR_KIND = "internal";

function formatUnexpectedExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || "Unknown error";
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unknown error";
}

function normalizeExitCode(exitCode: number | undefined): number {
  if (Number.isInteger(exitCode) && exitCode !== undefined && exitCode > 0 && exitCode <= 255) {
    return exitCode;
  }

  return 1;
}

function normalizeParseFailure(message: string): CommandFailure {
  return {
    kind: INVALID_ARGUMENTS_ERROR_KIND,
    message,
    exitCode: 1,
  };
}

function getCommandErrorLikeFields(error: unknown): {
  readonly kind: string;
  readonly message: string;
  readonly hint?: string | undefined;
  readonly details?: CommandFailure["details"];
  readonly exitCode?: number | undefined;
} | null {
  if (error instanceof CommandError) {
    return {
      kind: error.kind,
      message: error.message,
      hint: error.hint,
      details: error.details,
      exitCode: error.exitCode,
    };
  }

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const { kind, message, hint, details, exitCode } = error as {
    readonly kind?: unknown;
    readonly message?: unknown;
    readonly hint?: unknown;
    readonly details?: unknown;
    readonly exitCode?: unknown;
  };

  if (typeof kind !== "string" || typeof message !== "string") {
    return null;
  }

  return {
    kind,
    message,
    hint: typeof hint === "string" ? hint : undefined,
    details: details as CommandFailure["details"],
    exitCode: typeof exitCode === "number" ? exitCode : undefined,
  };
}

function normalizeExecutionFailure(error: unknown): CommandFailure {
  const structuredError = getCommandErrorLikeFields(error);

  if (structuredError) {
    return {
      kind: structuredError.kind,
      message: structuredError.message,
      hint: structuredError.hint,
      details: structuredError.details,
      exitCode: normalizeExitCode(structuredError.exitCode),
    };
  }

  return {
    kind: INTERNAL_ERROR_KIND,
    message: formatUnexpectedExecutionError(error),
    exitCode: 1,
  };
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
      error: normalizeParseFailure(parsed.error.message),
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
    const failure = normalizeExecutionFailure(error);

    return {
      parseOk: true,
      exitCode: failure.exitCode,
      error: failure,
      data: undefined,
      jsonMode,
    };
  }
}
