import { describe, expect, test } from "vite-plus/test";

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
});
