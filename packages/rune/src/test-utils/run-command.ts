import type { CommandFailure } from "../core/command-error";
import type { DefinedCommand, InferCommandData, InferCommandRecords } from "../core/command-types";
import type { RuneConfig } from "../core/define-config";
import type { CommandArgField, CommandOptionField } from "../core/field-types";

import { createBytesStdinSource } from "../core/command-stdin";
import { runCommandPipeline } from "../core/run-command-pipeline";

type RunnableCommand = Pick<
  DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  "json" | "jsonl" | "options" | "args"
> & {
  readonly run: (ctx: any) => unknown;
};

export type RunCommandStdinInput = string | Buffer | Uint8Array;

export interface RunCommandContext {
  /** Working directory value injected into `ctx.cwd`. Does not change `process.cwd()`. */
  readonly cwd?: string;
  /**
   * Environment variables used for option env fallbacks. This replaces
   * `process.env` for the command under test; it is not merged automatically.
   * When omitted, the command runs with an empty env map.
   */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /**
   * When `true`, simulates an AI agent environment so `json: true` commands
   * auto-enable JSON mode even without an explicit `--json` flag. Defaults
   * to `false` so tests behave the same regardless of whether the test
   * runner itself is invoked from an AI agent (which would otherwise be
   * detected as `isAgent`).
   */
  readonly simulateAgent?: boolean;
  /** Global options to inject as if they were defined by `defineConfig({ options })`. */
  readonly globalOptions?: readonly CommandOptionField[];
  /**
   * Stdin bytes injected into `ctx.stdin`. When omitted, tests receive an
   * isolated empty TTY-like stdin instead of inheriting `process.stdin`.
   */
  readonly stdin?: RunCommandStdinInput;
}

export type CommandExecutionOutput<TCommandDocument = never, TCommandRecord = never> =
  | { readonly kind: "text" }
  | { readonly kind: "json"; readonly document: TCommandDocument | undefined }
  | { readonly kind: "jsonl"; readonly records: TCommandRecord[] };

export interface CommandExecutionResult<TCommandDocument = never, TCommandRecord = never> {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: CommandFailure | undefined;
  readonly output: CommandExecutionOutput<TCommandDocument, TCommandRecord>;
}

export type RunCommandResult<TCommand extends RunnableCommand> = CommandExecutionResult<
  InferCommandData<TCommand>,
  InferCommandRecords<TCommand>
> &
  (TCommand extends { readonly jsonl: true }
    ? {
        readonly output: {
          readonly kind: "jsonl";
          readonly records: InferCommandRecords<TCommand>[];
        };
      }
    : TCommand extends { readonly json: true }
      ? {
          readonly output: {
            readonly kind: "json";
            readonly document: InferCommandData<TCommand> | undefined;
          };
        }
      : { readonly output: { readonly kind: "text" } });

/**
 * Exercises a resolved leaf command through Rune's real parse-and-execute
 * path, without involving manifest routing or top-level CLI behavior.
 *
 * Input is passed as a `string[]` of CLI tokens — the same shape a user
 * would type in a terminal — so that argv parsing, type coercion, schema
 * validation, required/default handling, and duplicate/unknown option
 * detection all run exactly as they do at real CLI invocation.
 *
 * @param command - A command created by `defineCommand`.
 * @param argv    - CLI tokens forwarded to the command's parse-and-execute
 *                  pipeline. Defaults to `[]` (no arguments).
 * @param context - Optional execution context such as `cwd`.
 * @returns A captured result including `exitCode`, `stdout`, `stderr`,
 *          `error`, and `output`.
 *
 * @example Basic usage
 * ```ts
 * const result = await runCommand(command, ["--name", "rune"]);
 *
 * expect(result.exitCode).toBe(0);
 * expect(result.stdout).toBe("hello rune\n");
 * ```
 *
 * @example Testing validation errors
 * ```ts
 * const command = defineCommand({
 *   args: [{ name: "id", type: "string", required: true }],
 *   async run(ctx) {
 *     ctx.output.log(ctx.args.id);
 *   },
 * });
 *
 * // Missing required argument
 * const result = await runCommand(command, []);
 *
 * expect(result.exitCode).toBe(1);
 * expect(result.stderr).not.toBe("");
 * ```
 *
 * @example Testing default values
 * ```ts
 * const command = defineCommand({
 *   options: [{ name: "count", type: "number", default: 1 }],
 *   async run(ctx) {
 *     ctx.output.log(`count=${ctx.options.count}`);
 *   },
 * });
 *
 * const result = await runCommand(command, []);
 *
 * expect(result.stdout).toBe("count=1\n");
 * ```
 *
 * @example JSON mode via `--json` flag
 * ```ts
 * const command = defineCommand({
 *   json: true,
 *   async run() {
 *     return { items: [1, 2, 3] };
 *   },
 * });
 *
 * const result = await runCommand(command, ["--json"]);
 *
 * expect(result.output.document).toEqual({ items: [1, 2, 3] });
 * expect(result.stdout).toBe("");
 * ```
 */
export async function runCommand<TCommand extends RunnableCommand>(
  command: TCommand,
  argv: string[] = [],
  context: RunCommandContext = {},
): Promise<RunCommandResult<TCommand>> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const result = await runCommandPipeline({
    command,
    argv,
    globalOptions: context.globalOptions,
    env: context.env ?? {},
    cwd: context.cwd,
    simulateAgent: context.simulateAgent ?? false,
    stdin: createRunCommandStdinSource(context.stdin),
    sink: {
      stdout: (message) => {
        stdoutChunks.push(message);
      },
      stderr: (message) => {
        stderrChunks.push(message);
      },
    },
  });

  if (result.jsonlMode && result.error) {
    stderrChunks.push(`${JSON.stringify(renderJsonError(result.error))}\n`);
  } else if (!result.jsonMode && result.error) {
    const rendered = renderHumanError(result.error);

    if (rendered !== "") {
      stderrChunks.push(ensureTrailingNewline(rendered));
    }
  }

  const executionResult = {
    exitCode: result.exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    error: result.error,
    output: createCommandOutput<TCommand>(command, result),
  };

  return executionResult as RunCommandResult<TCommand>;
}

function createCommandOutput<TCommand extends RunnableCommand>(
  command: TCommand,
  result: {
    readonly data?: InferCommandData<TCommand> | undefined;
    readonly records?: InferCommandRecords<TCommand>[] | undefined;
  },
): CommandExecutionOutput<InferCommandData<TCommand>, InferCommandRecords<TCommand>> {
  if (command.jsonl) {
    return {
      kind: "jsonl",
      // The pipeline result keeps records optional for non-jsonl callers. The
      // test helper makes JSON Lines records a stable array, including parse
      // failures or failures before the command yields.
      records: result.records ?? [],
    };
  }

  if (command.json) {
    return {
      kind: "json",
      document: result.data,
    };
  }

  return { kind: "text" };
}

export function createRunCommand<TConfig extends RuneConfig>(config: TConfig) {
  return function runCommandWithConfig<TCommand extends RunnableCommand>(
    command: TCommand,
    argv: string[] = [],
    context: RunCommandContext = {},
  ): Promise<RunCommandResult<TCommand>> {
    return runCommand(command, argv, {
      ...context,
      globalOptions: config.options,
    });
  };
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

function renderJsonError(error: CommandFailure): {
  readonly error: Record<string, unknown>;
} {
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

function createRunCommandStdinSource(input: RunCommandStdinInput | undefined) {
  if (input === undefined) {
    return createBytesStdinSource(new Uint8Array(), { isTTY: true, isPiped: false });
  }

  return createBytesStdinSource(input);
}

function renderHumanError(error: CommandFailure): string {
  const lines = [error.message];

  if (error.hint) {
    lines.push(`Hint: ${error.hint}`);
  }

  return lines.join("\n");
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
