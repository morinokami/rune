import type { CreateRuneAppCommandContext } from "./commands/index.ts";

export type RunContext = Pick<CreateRuneAppCommandContext, "options" | "args" | "cwd" | "output">;

export type InteractiveRunContext = Pick<
  CreateRuneAppCommandContext,
  "options" | "args" | "cwd" | "output" | "rawArgs"
>;
