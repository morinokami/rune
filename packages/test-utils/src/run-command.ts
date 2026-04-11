import {
  runCommandPipeline,
  type CommandArgField,
  type CommandFailure,
  type CommandOptionField,
  type DefinedCommand,
  type InferCommandData,
} from "@rune-cli/core";

type RunnableCommand = Pick<
  DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  "json" | "args" | "options"
> & {
  readonly run: (ctx: any) => unknown;
};

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

export interface RunCommandContext {
  /** Working directory value injected into `ctx.cwd`. Does not change `process.cwd()`. */
  readonly cwd?: string;
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
    cwd: context.cwd,
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
