import {
  runCommandPipeline,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
} from "@rune-cli/core";

export interface RunCommandContext {
  /** Working directory value injected into `ctx.cwd`. Does not change `process.cwd()`. */
  readonly cwd?: string;
}

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string | undefined;
  readonly data?: unknown;
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
 *          `errorMessage`, and `data` (for `json: true` commands).
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
 *     ctx.output.info(ctx.args.id);
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
 *     ctx.output.info(`count=${ctx.options.count}`);
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
export async function runCommand(
  command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>,
  argv: string[] = [],
  context: RunCommandContext = {},
): Promise<CommandExecutionResult> {
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

  if (!result.parseOk && result.errorMessage) {
    stderrChunks.push(result.errorMessage);
  }

  return {
    exitCode: result.exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    errorMessage: result.errorMessage,
    data: result.data,
  };
}
