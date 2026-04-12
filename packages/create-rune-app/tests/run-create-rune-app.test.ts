import { afterEach, describe, expect, test } from "vite-plus/test";

import type { CreateRuneAppCommandContext } from "../src/commands/index.ts";

import { runCreateRuneApp } from "../src/commands/index.ts";
import { cleanupTempDirs, createOutputSpy, makeFakeServices } from "./test-helpers.ts";

afterEach(async () => {
  await cleanupTempDirs();
});

function createCommandContext(
  overrides: Partial<CreateRuneAppCommandContext> = {},
): CreateRuneAppCommandContext {
  const { output } = createOutputSpy();

  return {
    args: { projectName: "my-app" },
    cwd: "/tmp/create-rune-app",
    options: { yes: false, install: true, git: true },
    rawArgs: [],
    output,
    ...overrides,
  };
}

describe("runCreateRuneApp", () => {
  test("routes to non-interactive mode when --yes is passed", async () => {
    const { services } = makeFakeServices();
    const ctx = createCommandContext({
      options: { yes: true, install: true, git: true },
      rawArgs: ["my-app", "--yes"],
    });
    const calls = { interactive: 0, nonInteractive: 0 };

    await runCreateRuneApp(ctx, {
      services,
      isInteractive: () => true,
      runInteractive: async () => {
        calls.interactive += 1;
      },
      runNonInteractive: async (actualCtx, actualServices) => {
        calls.nonInteractive += 1;
        expect(actualCtx).toBe(ctx);
        expect(actualServices).toBe(services);
      },
    });

    expect(calls).toEqual({ interactive: 0, nonInteractive: 1 });
  });

  test("routes to non-interactive mode when stdin is not interactive", async () => {
    const { services } = makeFakeServices();
    const ctx = createCommandContext();
    const calls = { interactive: 0, nonInteractive: 0 };

    await runCreateRuneApp(ctx, {
      services,
      isInteractive: () => false,
      runInteractive: async () => {
        calls.interactive += 1;
      },
      runNonInteractive: async () => {
        calls.nonInteractive += 1;
      },
    });

    expect(calls).toEqual({ interactive: 0, nonInteractive: 1 });
  });

  test("routes to interactive mode when stdin is interactive and --yes is absent", async () => {
    const { services } = makeFakeServices();
    const ctx = createCommandContext();
    const calls = { interactive: 0, nonInteractive: 0 };

    await runCreateRuneApp(ctx, {
      services,
      isInteractive: () => true,
      runInteractive: async (actualCtx, actualServices) => {
        calls.interactive += 1;
        expect(actualCtx).toBe(ctx);
        expect(actualServices).toBe(services);
      },
      runNonInteractive: async () => {
        calls.nonInteractive += 1;
      },
    });

    expect(calls).toEqual({ interactive: 1, nonInteractive: 0 });
  });
});
