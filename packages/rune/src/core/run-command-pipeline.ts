import { isAgent } from "std-env";

import type { OutputSink } from "./command-output";
import type { CommandStdinSource } from "./command-stdin";
import type { DefinedCommand, InferCommandData, InferCommandRecords } from "./command-types";
import type { CommandArgField, CommandOptionField } from "./field-types";

import { resolveAgentDetected } from "./agent-detection";
import { addCamelCaseAliases, normalizeToCanonicalKeys } from "./camel-case-aliases";
import { CommandError, type CommandFailure } from "./command-error";
import { createOutput } from "./command-output";
import { createCommandStdin, createProcessStdinSource } from "./command-stdin";
import { parseCommandArgs } from "./parse-command-args";
import { isSchemaField } from "./schema-field";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

type RunnableCommand = Pick<
  DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  "json" | "jsonl" | "options" | "args"
> & {
  readonly run: (ctx: any) => unknown;
};

export interface RunCommandPipelineInput {
  readonly command: RunnableCommand;
  readonly argv: readonly string[];
  readonly globalOptions?: readonly CommandOptionField[] | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly cwd?: string | undefined;
  readonly sink?: OutputSink | undefined;
  readonly stdin?: CommandStdinSource | undefined;
  /**
   * Overrides agent-environment detection for `json: true` commands. When the
   * environment looks like an AI agent, JSON mode is auto-enabled even
   * without an explicit `--json` flag.
   *
   * - `true`: behave as if running under an agent (auto-enable JSON mode).
   * - `false`: behave as if not running under an agent (only `--json` enables
   *   JSON mode).
   * - omitted: detect from the environment via std-env (`isAgent`), unless
   *   `RUNE_DISABLE_AUTO_JSON=1` is set, in which case auto-enable is
   *   suppressed regardless of detection.
   */
  readonly simulateAgent?: boolean | undefined;
}

export interface RunCommandPipelineResult<TCommandData = unknown, TCommandRecord = never> {
  /** Whether argv parsing succeeded. When `false`, the command did not run. */
  readonly parseOk: boolean;
  readonly exitCode: number;
  readonly error?: CommandFailure | undefined;
  readonly data?: TCommandData | undefined;
  readonly records?: TCommandRecord[] | undefined;
  readonly jsonMode: boolean;
  readonly jsonlMode: boolean;
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
export async function runCommandPipeline<TCommand extends RunnableCommand>(
  input: Omit<RunCommandPipelineInput, "command"> & { readonly command: TCommand },
): Promise<RunCommandPipelineResult<InferCommandData<TCommand>, InferCommandRecords<TCommand>>> {
  const {
    command,
    argv,
    globalOptions = [],
    env = {},
    cwd,
    sink = defaultSink,
    stdin: stdinSource = createProcessStdinSource(),
    simulateAgent,
  } = input;
  const commandDefinition = command as unknown as DefinedCommand<
    readonly CommandArgField[],
    readonly CommandOptionField[]
  >;
  const effectiveOptions = [...globalOptions, ...commandDefinition.options];
  const effectiveCommandDefinition = {
    ...commandDefinition,
    options: effectiveOptions,
  };

  const { jsonMode: explicitJsonMode, parseArgv } = commandDefinition.json
    ? extractJsonFlag(argv)
    : { jsonMode: false, parseArgv: argv };
  if (commandDefinition.jsonl && hasJsonFlagBeforeTerminator(argv)) {
    return {
      parseOk: false,
      exitCode: 1,
      error: normalizeParseFailure("--json is not supported by JSON Lines commands"),
      data: undefined,
      records: [],
      jsonMode: false,
      jsonlMode: true,
    };
  }
  const agentDetected =
    commandDefinition.json && !commandDefinition.jsonl
      ? resolveAgentDetected({
          simulateAgent,
          detectedAgent: isAgent,
          env: process.env,
        })
      : false;
  const jsonMode = commandDefinition.json && (explicitJsonMode || agentDetected);

  const output = createOutput(sink, { silentStdout: jsonMode || commandDefinition.jsonl });
  const stdin = createCommandStdin(stdinSource);

  const parsed = await parseCommandArgs(effectiveCommandDefinition, parseArgv, { env });

  if (!parsed.ok) {
    return {
      parseOk: false,
      exitCode: 1,
      error: normalizeParseFailure(parsed.error.message),
      data: undefined,
      records: commandDefinition.jsonl ? [] : undefined,
      jsonMode,
      jsonlMode: commandDefinition.jsonl,
    };
  }

  const records: unknown[] = [];

  try {
    const args = addCamelCaseAliases(
      normalizeToCanonicalKeys(commandDefinition.args, {
        ...parsed.value.args,
      } as Record<string, unknown>),
    );
    const rawOptions = normalizeOptions(
      effectiveOptions,
      parsed.value.options as Record<string, unknown>,
    );
    const options = addCamelCaseAliases(
      commandDefinition.json ? { ...rawOptions, json: jsonMode } : rawOptions,
    );

    // The `command.run` signature is generic, but at this layer we operate on
    // erased `DefinedCommand` instances. The casts above produce the shapes
    // that `command.run` expects at runtime; TypeScript cannot verify this
    // statically, so we use `as never` to satisfy the call-site constraint.
    const data = await commandDefinition.run({
      options: options as never,
      args: args as never,
      cwd: cwd ?? process.cwd(),
      rawArgs: argv,
      output,
      stdin,
    });

    if (commandDefinition.jsonl) {
      if (!isJsonLineIterable(data)) {
        const failure = normalizeExecutionFailure(
          new CommandError({
            kind: INVALID_COMMAND_RESULT_ERROR_KIND,
            message: "JSON Lines commands must return an iterable",
          }),
        );

        return {
          parseOk: true,
          exitCode: failure.exitCode,
          error: failure,
          data: undefined,
          records: records as InferCommandRecords<TCommand>[],
          jsonMode: false,
          jsonlMode: true,
        };
      }

      for await (const record of data) {
        const serialized = serializeJsonLineRecord(record, records.length);

        if (!serialized.ok) {
          return {
            parseOk: true,
            exitCode: serialized.error.exitCode,
            error: serialized.error,
            data: undefined,
            records: records as InferCommandRecords<TCommand>[],
            jsonMode: false,
            jsonlMode: true,
          };
        }

        records.push(record);
        await sink.stdout(`${serialized.value}\n`);
      }

      return {
        parseOk: true,
        exitCode: 0,
        data: undefined,
        records: records as InferCommandRecords<TCommand>[],
        jsonMode: false,
        jsonlMode: true,
      };
    }

    return {
      parseOk: true,
      exitCode: 0,
      data: data as InferCommandData<TCommand>,
      jsonMode,
      jsonlMode: false,
    };
  } catch (error) {
    const failure = normalizeExecutionFailure(error);

    return {
      parseOk: true,
      exitCode: failure.exitCode,
      error: failure,
      data: undefined,
      records: commandDefinition.jsonl ? (records as InferCommandRecords<TCommand>[]) : undefined,
      jsonMode,
      jsonlMode: commandDefinition.jsonl,
    };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const defaultSink: OutputSink = {
  stdout: (message) => {
    return writeStream(process.stdout, message);
  },
  stderr: (message) => {
    return writeStream(process.stderr, message);
  },
};

const INVALID_ARGUMENTS_ERROR_KIND = "rune/invalid-arguments";
const INVALID_COMMAND_RESULT_ERROR_KIND = "rune/invalid-command-result";
const SERIALIZATION_FAILED_ERROR_KIND = "rune/serialization-failed";
const UNEXPECTED_ERROR_KIND = "rune/unexpected";

/**
 * Extracts a framework-managed `--json` flag from argv.
 * Only tokens before the `--` terminator are considered.
 *
 * Returns the detected JSON mode flag and the argv to pass to the parser
 * (with `--json` removed). The original argv is always preserved for
 * `ctx.rawArgs`.
 */
function extractJsonFlag(argv: readonly string[]): {
  jsonMode: boolean;
  parseArgv: readonly string[];
} {
  const terminatorIndex = argv.indexOf("--");
  const scanEnd = terminatorIndex === -1 ? argv.length : terminatorIndex;
  const jsonIndex = argv.indexOf("--json");

  if (jsonIndex === -1 || jsonIndex >= scanEnd) {
    return { jsonMode: false, parseArgv: argv };
  }

  const parseArgv = [...argv.slice(0, jsonIndex), ...argv.slice(jsonIndex + 1)];
  return { jsonMode: true, parseArgv };
}

function hasJsonFlagBeforeTerminator(argv: readonly string[]): boolean {
  const terminatorIndex = argv.indexOf("--");
  const scanEnd = terminatorIndex === -1 ? argv.length : terminatorIndex;
  return argv.slice(0, scanEnd).includes("--json");
}

function isJsonLineIterable(value: unknown): value is Iterable<unknown> | AsyncIterable<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Symbol.iterator in value || Symbol.asyncIterator in value;
}

function serializeJsonLineRecord(
  record: unknown,
  index: number,
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: CommandFailure } {
  try {
    const value = JSON.stringify(record);

    if (value === undefined) {
      return {
        ok: false,
        error: {
          kind: SERIALIZATION_FAILED_ERROR_KIND,
          message: "Failed to serialize JSON Lines record",
          details: { index, reason: "JSON.stringify returned undefined" },
          exitCode: 1,
        },
      };
    }

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: SERIALIZATION_FAILED_ERROR_KIND,
        message: "Failed to serialize JSON Lines record",
        details: {
          index,
          reason: formatUnexpectedExecutionError(error),
        },
        exitCode: 1,
      },
    };
  }
}

async function writeStream(stream: NodeJS.WriteStream, contents: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(contents, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

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
    kind: UNEXPECTED_ERROR_KIND,
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
