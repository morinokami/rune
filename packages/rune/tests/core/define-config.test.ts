import { describe, expect, test } from "vite-plus/test";

import { defineConfig } from "../../src/core/define-config";

describe("defineConfig", () => {
  test("defineConfig returns a config with help", () => {
    const config = defineConfig({
      help() {
        return "custom\n";
      },
    });

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
    expect(config.help).toBeUndefined();
  });
});
