export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CommandErrorInit {
  readonly kind: string;
  readonly message: string;
  readonly hint?: string | undefined;
  readonly details?: JsonValue | undefined;
  readonly exitCode?: number | undefined;
  readonly cause?: unknown;
}

export interface CommandFailure {
  readonly kind: string;
  readonly message: string;
  readonly hint?: string | undefined;
  readonly details?: JsonValue | undefined;
  readonly exitCode: number;
}

export class CommandError extends Error {
  readonly kind: string;
  readonly hint?: string | undefined;
  readonly details?: JsonValue | undefined;
  readonly exitCode?: number | undefined;

  constructor(init: CommandErrorInit) {
    super(init.message, { cause: init.cause });

    this.name = "CommandError";
    this.kind = init.kind;
    this.hint = init.hint;
    this.details = init.details;
    this.exitCode = init.exitCode;
  }
}
