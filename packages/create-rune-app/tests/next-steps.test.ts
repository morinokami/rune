import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import type { PackageManager } from "../src/services/index.ts";

import { computeNextSteps } from "../src/next-steps.ts";

const pm: PackageManager = {
  name: "pnpm",
  installArgs: ["install"],
  installCommand: "pnpm install",
  runCommand: (script, args) => `pnpm ${script} ${args}`,
};

describe("computeNextSteps", () => {
  test("includes cd and start when creating a new directory", () => {
    const result = computeNextSteps({
      cwd: "/workspace",
      projectRoot: "/workspace/my-app",
      isCurrentDir: false,
      didInstall: true,
      pm,
    });

    expect(result.displayPath).toBe("my-app");
    expect(result.lines).toEqual(["Next steps:", "  $ cd my-app", "  $ pnpm start hello"]);
  });

  test("omits cd when scaffolding into the current directory", () => {
    const result = computeNextSteps({
      cwd: "/workspace",
      projectRoot: "/workspace",
      isCurrentDir: true,
      didInstall: true,
      pm,
    });

    expect(result.displayPath).toBe(".");
    expect(result.lines).toEqual(["Next steps:", "  $ pnpm start hello"]);
  });

  test("includes install command when install was skipped", () => {
    const result = computeNextSteps({
      cwd: "/workspace",
      projectRoot: "/workspace/my-app",
      isCurrentDir: false,
      didInstall: false,
      pm,
    });

    expect(result.lines).toContain("  $ pnpm install");
  });

  test("uses the relative path when cwd is unrelated to projectRoot", () => {
    const result = computeNextSteps({
      cwd: "/some/other",
      projectRoot: "/workspace/my-app",
      isCurrentDir: false,
      didInstall: true,
      pm,
    });

    expect(result.displayPath).toBe(path.relative("/some/other", "/workspace/my-app"));
  });
});
