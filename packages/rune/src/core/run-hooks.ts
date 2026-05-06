import type { CommandFailure, JsonValue } from "./command-error";
import type { CommandOutput } from "./command-output";
import type { CommandStdin } from "./command-stdin";
import type { InferNamedFields, RuneConfigLocals } from "./command-types";
import type { CommandOptionField } from "./field-types";
import type { Simplify } from "./internal-types/utils";

export type RunHookOutputMode = "text" | "json" | "jsonl";

export type RunErrorStage = "locals" | "beforeRun" | "run" | "afterRun";

export interface RunHookCommandMetadata {
  readonly cliName: string;
  readonly path: readonly string[];
  readonly name: string;
}

type RunHookOptions<TOptionsFields extends readonly CommandOptionField[]> = Simplify<
  Readonly<InferNamedFields<TOptionsFields, true>> & Readonly<Record<string, unknown>>
>;

export interface BaseRunHookContext<
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> {
  readonly command: RunHookCommandMetadata;
  readonly outputMode: RunHookOutputMode;
  readonly args: Readonly<Record<string, unknown>>;
  readonly options: RunHookOptions<TOptionsFields>;
  readonly locals: RuneConfigLocals;
  readonly cwd: string;
  readonly rawArgs: readonly string[];
  readonly output: CommandOutput;
  readonly stdin: CommandStdin;
}

export interface LocalsFactoryContext<
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> {
  readonly command: RunHookCommandMetadata;
  readonly outputMode: RunHookOutputMode;
  readonly args: Readonly<Record<string, unknown>>;
  readonly options: RunHookOptions<TOptionsFields>;
  readonly cwd: string;
  readonly rawArgs: readonly string[];
  readonly output: CommandOutput;
}

export interface BeforeRunContext<
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> extends BaseRunHookContext<TOptionsFields> {}

export interface AfterRunContext<
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> extends BaseRunHookContext<TOptionsFields> {
  readonly result: RunHookResult;
}

export interface RunErrorContext<
  TOptionsFields extends readonly CommandOptionField[] = readonly [],
> extends Omit<BaseRunHookContext<TOptionsFields>, "locals"> {
  readonly stage: RunErrorStage;
  readonly error: CommandFailure;
  readonly locals?: RuneConfigLocals | undefined;
}

export type RunHookResult =
  | { readonly kind: "text" }
  | { readonly kind: "json"; readonly data: unknown }
  | { readonly kind: "jsonl"; readonly records: readonly unknown[] };

export interface RuneHooks<TOptionsFields extends readonly CommandOptionField[] = readonly []> {
  readonly beforeRun?:
    | ((ctx: BeforeRunContext<TOptionsFields>) => void | Promise<void>)
    | undefined;
  readonly afterRun?: ((ctx: AfterRunContext<TOptionsFields>) => void | Promise<void>) | undefined;
  readonly onRunError?:
    | ((ctx: RunErrorContext<TOptionsFields>) => void | Promise<void>)
    | undefined;
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
