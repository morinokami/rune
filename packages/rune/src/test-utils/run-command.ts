import type { CommandFailure } from "../core/command-error";
import type { DefinedCommand, InferCommandData } from "../core/command-types";
import type { RuneConfig } from "../core/define-config";
import type { CommandArgField, CommandOptionField } from "../core/field-types";

import { runCommandPipeline } from "../core/run-command-pipeline";

type RunnableCommand = Pick<
  DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  "json" | "options" | "args"
> & {
  readonly run: (ctx: any) => unknown;
};

export interface RunCommandContext {
  /** Working directory value injected into `ctx.cwd`. Does not change `process.cwd()`. */
  readonly cwd?: string;
  /**
   * When `true`, simulates an AI agent environment so `json: true` commands
   * auto-enable JSON mode even without an explicit `--json` flag. Defaults
   * to `false` so tests behave the same regardless of whether the test
   * runner itself is invoked from an AI agent (which would otherwise be
   * detected as `isAgent`).
   */
  readonly simulateAgent?: boolean;
  readonly globalOptions?: readonly CommandOptionField[];
}

export interface CommandExecutionResult<TCommandData = unknown> {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: CommandFailure | undefined;
  readonly data?: TCommandData | undefined;
}

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
 *          `error`, and `data` (for `json: true` commands).
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
 * expect(result.data).toEqual({ items: [1, 2, 3] });
 * expect(result.stdout).toBe("");
 * ```
 */
export async function runCommand<TCommand extends RunnableCommand>(
  command: TCommand,
  argv: string[] = [],
  context: RunCommandContext = {},
): Promise<CommandExecutionResult<InferCommandData<TCommand>>> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const result = await runCommandPipeline({
    command,
    argv,
    globalOptions: context.globalOptions,
    cwd: context.cwd,
    simulateAgent: context.simulateAgent ?? false,
    sink: {
      stdout: (message) => stdoutChunks.push(message),
      stderr: (message) => stderrChunks.push(message),
    },
  });

  if (!result.jsonMode && result.error) {
    const rendered = renderHumanError(result.error);

    if (rendered !== "") {
      stderrChunks.push(ensureTrailingNewline(rendered));
    }
  }

  return {
    exitCode: result.exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    error: result.error,
    data: result.data as InferCommandData<TCommand>,
  };
}

export function createRunCommand<TConfig extends RuneConfig>(config: TConfig) {
  return function runCommandWithConfig<TCommand extends RunnableCommand>(
    command: TCommand,
    argv: string[] = [],
    context: RunCommandContext = {},
  ): Promise<CommandExecutionResult<InferCommandData<TCommand>>> {
    return runCommand(command, argv, {
      ...context,
      globalOptions: config.options,
    });
  };
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
