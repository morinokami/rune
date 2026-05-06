import type { CommandFailure, JsonValue } from "./command-error";
import type { CommandOutput } from "./command-output";
import type { CommandStdin } from "./command-stdin";
import type { RuneConfigLocals } from "./command-types";

export type RunHookOutputMode = "text" | "json" | "jsonl";

export type RunErrorStage = "locals" | "beforeRun" | "run" | "afterRun";

export interface RunHookCommandMetadata {
  readonly cliName: string;
  readonly path: readonly string[];
  readonly name: string;
}

export interface BaseRunHookContext {
  readonly command: RunHookCommandMetadata;
  readonly outputMode: RunHookOutputMode;
  readonly args: Readonly<Record<string, unknown>>;
  readonly options: Readonly<Record<string, unknown>>;
  readonly locals: RuneConfigLocals;
  readonly cwd: string;
  readonly rawArgs: readonly string[];
  readonly output: CommandOutput;
  readonly stdin: CommandStdin;
}

export interface LocalsFactoryContext {
  readonly command: RunHookCommandMetadata;
  readonly outputMode: RunHookOutputMode;
  readonly args: Readonly<Record<string, unknown>>;
  readonly options: Readonly<Record<string, unknown>>;
  readonly cwd: string;
  readonly rawArgs: readonly string[];
  readonly output: CommandOutput;
}

export interface BeforeRunContext extends BaseRunHookContext {}

export interface AfterRunContext extends BaseRunHookContext {
  readonly result: RunHookResult;
}

export interface RunErrorContext extends Omit<BaseRunHookContext, "locals"> {
  readonly stage: RunErrorStage;
  readonly error: CommandFailure;
  readonly locals?: RuneConfigLocals | undefined;
}

export type RunHookResult =
  | { readonly kind: "text" }
  | { readonly kind: "json"; readonly data: unknown }
  | { readonly kind: "jsonl"; readonly records: readonly unknown[] };

export interface RuneHooks {
  readonly beforeRun?: ((ctx: BeforeRunContext) => void | Promise<void>) | undefined;
  readonly afterRun?: ((ctx: AfterRunContext) => void | Promise<void>) | undefined;
  readonly onRunError?: ((ctx: RunErrorContext) => void | Promise<void>) | undefined;
}

export function createHookFailedFailure(
  originalFailure: CommandFailure,
  hookFailure: CommandFailure,
): CommandFailure {
  return {
    kind: "rune/hook-failed",
    message: `onRunError hook failed: ${hookFailure.message}`,
    details: {
      originalFailure: toFailureDetails(originalFailure),
      hookFailure: toFailureDetails(hookFailure),
    },
    exitCode: hookFailure.exitCode,
  };
}

function toFailureDetails(failure: CommandFailure): JsonValue {
  return {
    kind: failure.kind,
    message: failure.message,
    exitCode: failure.exitCode,
    ...(failure.hint ? { hint: failure.hint } : {}),
    ...(isJsonSerializable(failure.details) ? { details: failure.details } : {}),
  };
}

function isJsonSerializable(value: unknown): value is JsonValue {
  if (value === undefined) {
    return false;
  }

  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}
