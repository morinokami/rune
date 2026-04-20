import { defineCommand } from "@rune-cli/rune";
import { hasTTY, isAgent, isCI } from "std-env";

import type { Services } from "../services/index.ts";

import { runInteractive } from "../run-interactive.ts";
import { runNonInteractive } from "../run-non-interactive.ts";
import { defaultServices } from "../services/index.ts";

const command = defineCommand({
  description: "Create a new Rune CLI project",
  args: [
    {
      name: "projectName",
      type: "string",
      description: "Directory name for the new project",
    },
  ],
  options: [
    {
      name: "yes",
      type: "boolean",
      short: "y",
      description: "Skip all interactive prompts and use defaults",
    },
    {
      name: "install",
      type: "boolean",
      default: true,
      description: "Install dependencies after scaffolding",
    },
    {
      name: "git",
      type: "boolean",
      default: true,
      description: "Initialize a git repository",
    },
  ],
  async run(ctx) {
    await runCreateRuneApp(ctx);
  },
});

export default command;

export type CreateRuneAppCommandContext = Parameters<typeof command.run>[0];

export interface CreateRuneAppDeps {
  readonly services: Services;
  readonly isInteractive: () => boolean;
  readonly runInteractive: (ctx: CreateRuneAppCommandContext, services: Services) => Promise<void>;
  readonly runNonInteractive: (
    ctx: CreateRuneAppCommandContext,
    services: Services,
  ) => Promise<void>;
}

export const defaultCreateRuneAppDeps: CreateRuneAppDeps = {
  services: defaultServices,
  isInteractive: () => hasTTY && !isCI && !isAgent,
  runInteractive,
  runNonInteractive,
};

export async function runCreateRuneApp(
  ctx: CreateRuneAppCommandContext,
  deps: CreateRuneAppDeps = defaultCreateRuneAppDeps,
): Promise<void> {
  const nonInteractive = ctx.options.yes || !deps.isInteractive();

  if (nonInteractive) {
    await deps.runNonInteractive(ctx, deps.services);
    return;
  }

  await deps.runInteractive(ctx, deps.services);
}
