import { describe, expect, expectTypeOf, test } from "vite-plus/test";
import { z } from "zod";

import type { InferConfigOptions } from "../../src/core/command-types";

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

  test("defineConfig preserves option identity for config option inference", () => {
    const config = defineConfig({
      options: [
        { name: "profile", type: "string", default: "prod" },
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

  test("defineConfig rejects config option names reserved by the framework", () => {
    expect(() =>
      defineConfig({
        options: [{ name: "json", type: "boolean" }],
      }),
    ).toThrow('Option name "json" is reserved by the framework.');
  });
});
