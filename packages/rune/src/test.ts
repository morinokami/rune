import {
  captureProcessOutput,
  executeCommand,
  type CommandArgField,
  type CommandOptionField,
  type DefinedCommand,
  type ExecuteCommandInput,
  type InferExecutionFields,
} from "@rune-cli/core";

export type RunCommandOptions<TOptions, TArgs> = ExecuteCommandInput<TOptions, TArgs>;

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorMessage?: string | undefined;
}

/**
 * Runs a command definition directly in-process for testing.
 *
 * This helper bypasses Rune's CLI parser and validation layers. Callers
 * provide already-normalized `options` and `args` values, and the command's
 * `run` function is executed with those values injected into the context.
 *
 * All output written to `process.stdout`, `process.stderr`, and `console` is
 * captured and returned as strings so tests can assert on them.
 *
 * @param command - A command created with {@link defineCommand}.
 * @param options - Pre-validated options, args, cwd, and rawArgs to inject.
 * @returns The exit code, captured stdout/stderr, and an optional error message.
 *
 * @example
 * ```ts
 * import { defineCommand } from "rune";
 * import { runCommand } from "rune/test";
 * import { expect, test } from "vitest";
 *
 * const hello = defineCommand({
 *   options: [{ name: "name", type: "string", required: true }],
 *   run(ctx) {
 *     console.log(`Hello, ${ctx.options.name}!`);
 *   },
 * });
 *
 * test("hello command", async () => {
 *   const result = await runCommand(hello, {
 *     options: { name: "Rune" },
 *   });
 *
 *   expect(result.exitCode).toBe(0);
 *   expect(result.stdout).toBe("Hello, Rune!\n");
 * });
 * ```
 */
export async function runCommand<
  TArgsFields extends readonly CommandArgField[],
  TOptionsFields extends readonly CommandOptionField[],
>(
  command: DefinedCommand<TArgsFields, TOptionsFields>,
  options: RunCommandOptions<
    InferExecutionFields<TOptionsFields>,
    InferExecutionFields<TArgsFields>
  > = {},
): Promise<CommandExecutionResult> {
  const captured = await captureProcessOutput(() => executeCommand(command, options));

  if (!captured.ok) {
    throw captured.error;
  }

  return {
    exitCode: captured.value.exitCode,
    stdout: captured.stdout,
    stderr: captured.stderr,
    errorMessage: captured.value.errorMessage,
  };
}
