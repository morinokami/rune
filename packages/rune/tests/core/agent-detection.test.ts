import { describe, expect, test } from "vite-plus/test";

import { isAutoJsonDisabled, resolveAgentDetected } from "../../src/core/agent-detection";

describe("resolveAgentDetected", () => {
  test("simulateAgent: true wins over RUNE_DISABLE_AUTO_JSON=1", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: true,
        detectedAgent: false,
        env: { RUNE_DISABLE_AUTO_JSON: "1" },
      }),
    ).toBe(true);
  });

  test("simulateAgent: false wins over detectedAgent and env var", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: false,
        detectedAgent: true,
        env: { RUNE_DISABLE_AUTO_JSON: "1" },
      }),
    ).toBe(false);
  });

  test("RUNE_DISABLE_AUTO_JSON=1 suppresses detected agent when simulateAgent is omitted", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: undefined,
        detectedAgent: true,
        env: { RUNE_DISABLE_AUTO_JSON: "1" },
      }),
    ).toBe(false);
  });

  test("RUNE_DISABLE_AUTO_JSON=true suppresses detected agent", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: undefined,
        detectedAgent: true,
        env: { RUNE_DISABLE_AUTO_JSON: "true" },
      }),
    ).toBe(false);
  });

  test("falls through to detectedAgent when env var is unset", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: undefined,
        detectedAgent: true,
        env: {},
      }),
    ).toBe(true);
  });

  test("returns false when nothing detects an agent", () => {
    expect(
      resolveAgentDetected({
        simulateAgent: undefined,
        detectedAgent: false,
        env: {},
      }),
    ).toBe(false);
  });
});

describe("isAutoJsonDisabled", () => {
  test.each([
    { label: "1", value: "1", expected: true },
    { label: "true", value: "true", expected: true },
    { label: "0", value: "0", expected: false },
    { label: "false", value: "false", expected: false },
    { label: "yes", value: "yes", expected: false },
    { label: "empty string", value: "", expected: false },
    { label: "unset", value: undefined, expected: false },
  ])("returns $expected when RUNE_DISABLE_AUTO_JSON is $label", ({ value, expected }) => {
    const env: NodeJS.ProcessEnv = value === undefined ? {} : { RUNE_DISABLE_AUTO_JSON: value };
    expect(isAutoJsonDisabled(env)).toBe(expected);
  });
});
