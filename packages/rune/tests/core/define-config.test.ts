import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import type { InferConfigLocals, InferConfigOptions } from "../../src/core/command-types";

import { defineConfig } from "../../src/core/define-config";

describe("defineConfig", () => {
  test("defineConfig returns a config with help", () => {
    const config = defineConfig({
      name: "custom-cli",
      version: "1.2.3",
      help() {
        return "custom\n";
      },
    });

    expect(config.name).toBe("custom-cli");
    expect(config.version).toBe("1.2.3");
    expect(config.help).toBeDefined();
    expect(
      config.help!({
        kind: "group",
        cliName: "test",
        pathSegments: [],
        subcommands: [],
        frameworkOptions: [],
        examples: [],
      }),
    ).toBe("custom\n");
  });

  test("defineConfig with empty input returns config without help", () => {
    const config = defineConfig({});
    expect(config.name).toBeUndefined();
    expect(config.version).toBeUndefined();
    expect(config.help).toBeUndefined();
  });

  test("defineConfig returns configured hooks", () => {
    const hooks = {
      beforeRun() {},
      afterRun() {},
      onRunError() {},
    };
    const config = defineConfig({ hooks });

    expect(config.hooks).toBe(hooks);
  });

  test("defineConfig returns configured locals factory", async () => {
    const config = defineConfig({
      locals(ctx) {
        return { cwd: ctx.cwd, profile: ctx.options.profile };
      },
    });

    expect(config.locals).toBeDefined();
    await expect(
      Promise.resolve(
        config.locals!({
          command: { cliName: "my-cli", path: ["show"], name: "show" },
          outputMode: "text",
          args: {},
          options: { profile: "dev" },
          cwd: "/tmp/project",
          rawArgs: [],
          output: {} as never,
        }),
      ),
    ).resolves.toEqual({ cwd: "/tmp/project", profile: "dev" });
  });

  test("defineConfig preserves option identity for config option inference", () => {
    const config = defineConfig({
      options: [
        { name: "profile", type: "string", env: "RUNE_PROFILE", default: "prod" },
        { name: "region", schema: z.enum(["ap-northeast-1", "us-east-1"]).optional() },
        { name: "verbose", type: "boolean" },
      ],
    });

    expectTypeOf<InferConfigOptions<typeof config>>().toEqualTypeOf<{
      profile: string;
      region?: "ap-northeast-1" | "us-east-1";
      verbose: boolean;
    }>();
  });

  test("defineConfig preserves locals return type for config locals inference", () => {
    const config = defineConfig({
      locals() {
        return {
          workspace: { id: "workspace-1" },
          api: { listProjects: () => ["rune"] },
        };
      },
    });

    expectTypeOf<InferConfigLocals<typeof config>>().toEqualTypeOf<{
      workspace: { id: string };
      api: { listProjects: () => string[] };
    }>();
  });

  test("defineConfig rejects config option names reserved by the framework", () => {
    expect(() =>
      defineConfig({
        options: [{ name: "json", type: "boolean" }],
      }),
    ).toThrow('Option name "json" is reserved by the framework.');
  });

  test("defineConfig rejects invalid option env names", () => {
    expect(() =>
      defineConfig({
        options: [{ name: "profile", type: "string", env: "RUNE-PROFILE" }],
      }),
    ).toThrow('Invalid env name "RUNE-PROFILE" for option "profile".');
  });
});
