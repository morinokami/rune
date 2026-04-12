import type { CreateRuneAppCommandContext } from "./commands/index.ts";

export type RunContext = Pick<CreateRuneAppCommandContext, "args" | "cwd" | "options" | "output">;

export type InteractiveRunContext = Pick<
  CreateRuneAppCommandContext,
  "args" | "cwd" | "options" | "output" | "rawArgs"
>;
