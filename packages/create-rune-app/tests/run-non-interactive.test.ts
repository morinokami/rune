import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";

import type { RunContext } from "../src/command-context.ts";

import { runNonInteractive } from "../src/run-non-interactive.ts";
import {
  cleanupTempDirs,
  createOutputSpy,
  createTempDir,
  makeFakeServices,
} from "./test-helpers.ts";

afterEach(async () => {
  await cleanupTempDirs();
});

function createRunContext(input: {
  readonly cwd: string;
  readonly projectName?: string | undefined;
  readonly install?: boolean | undefined;
  readonly git?: boolean | undefined;
}): { readonly ctx: RunContext; readonly lines: string[] } {
  const { output, lines } = createOutputSpy();

  return {
    ctx: {
      args: { projectName: input.projectName },
      cwd: input.cwd,
      options: {
        yes: false,
        install: input.install ?? true,
        git: input.git ?? true,
      },
      output,
    },
    lines,
  };
}

describe("runNonInteractive", () => {
  test("fails when project name is missing", async () => {
    const cwd = await createTempDir();
    const { services } = makeFakeServices();
    const { ctx } = createRunContext({ cwd, projectName: undefined });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "missing-project-name",
      message: "Project name is required",
    });
  });

  test("fails when target directory already exists", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "my-app"));
    const { services } = makeFakeServices();
    const { ctx } = createRunContext({ cwd, projectName: "my-app" });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "directory-exists",
    });
  });

  test("fails for '.' when the current directory has conflicting template entries", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "package.json"), "{}");
    const { services } = makeFakeServices();
    const { ctx } = createRunContext({ cwd, projectName: "." });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "directory-has-conflicts",
      message: "Target directory contains conflicting entries: package.json",
    });
  });

  test("wraps scaffold failures as a CommandError", async () => {
    const cwd = await createTempDir();
    const { services } = makeFakeServices({
      scaffoldProject: async () => {
        throw new Error("template download failed");
      },
    });
    const { ctx } = createRunContext({ cwd, projectName: "my-app" });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "scaffold-failed",
      message: "Failed to scaffold project: template download failed",
    });
  });

  test("scaffolds, installs, and initializes git on the happy path", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices();
    const { ctx, lines } = createRunContext({ cwd, projectName: "my-app" });

    await runNonInteractive(ctx, services);

    expect(calls.scaffold).toEqual([{ name: "my-app", cwd }]);
    expect(calls.install).toHaveLength(1);
    expect(calls.gitInit).toHaveLength(1);
    expect(lines).toContain("Scaffolding project: my-app");
    expect(lines).toContain("Installing dependencies with npm...");
    expect(lines).toContain("Initializing git repository...");
    expect(lines).toContain("");
    expect(lines).toContain("Rune project ready at my-app");
    expect(lines).toContain("Next steps:");
    expect(lines).toContain("  $ cd my-app");
    expect(lines).toContain("  $ npm run start -- hello");
  });

  test("uses current-directory wording and omits cd when scaffolding into '.'", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices();
    const { ctx, lines } = createRunContext({ cwd, projectName: "." });

    await runNonInteractive(ctx, services);

    expect(calls.scaffold).toEqual([{ name: ".", cwd }]);
    expect(lines).toContain("Scaffolding project in current directory");
    expect(lines).toContain("Rune project ready at .");
    expect(lines).toContain("Next steps:");
    expect(lines).not.toContain("  $ cd .");
    expect(lines).toContain("  $ npm run start -- hello");
  });

  test("skips installation and surfaces the install command in next steps", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices();
    const { ctx, lines } = createRunContext({
      cwd,
      projectName: "my-app",
      install: false,
    });

    await runNonInteractive(ctx, services);

    expect(calls.install).toHaveLength(0);
    expect(lines).toContain("  $ npm install");
  });

  test("skips git initialization when git is disabled", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices();
    const { ctx, lines } = createRunContext({
      cwd,
      projectName: "my-app",
      git: false,
    });

    await runNonInteractive(ctx, services);

    expect(calls.gitInit).toHaveLength(0);
    expect(lines).not.toContain("Initializing git repository...");
  });

  test("reports when git is not installed instead of failing", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices({
      checkGitInitAvailability: () => ({ ok: false, reason: "git-not-installed" }),
    });
    const { ctx, lines } = createRunContext({ cwd, projectName: "my-app" });

    await runNonInteractive(ctx, services);

    expect(calls.gitInit).toHaveLength(0);
    expect(lines).toContain("Skipping git initialization (git is not installed)");
  });

  test("reports when the target is already inside a git repository", async () => {
    const cwd = await createTempDir();
    const { services, calls } = makeFakeServices({
      checkGitInitAvailability: () => ({ ok: false, reason: "inside-existing-repo" }),
    });
    const { ctx, lines } = createRunContext({ cwd, projectName: "my-app" });

    await runNonInteractive(ctx, services);

    expect(calls.gitInit).toHaveLength(0);
    expect(lines).toContain("Skipping git initialization (already inside a git repository)");
  });

  test("surfaces install failure as a CommandError", async () => {
    const cwd = await createTempDir();
    const { services } = makeFakeServices({
      installDependencies: async () => {
        throw new Error("network down");
      },
    });
    const { ctx } = createRunContext({ cwd, projectName: "my-app" });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "install-failed",
      message: "Failed to install dependencies: network down",
    });
  });

  test("fails with git-init-failed when tryGitInit returns false", async () => {
    const cwd = await createTempDir();
    const { services } = makeFakeServices({
      tryGitInit: () => false,
    });
    const { ctx } = createRunContext({ cwd, projectName: "my-app" });

    await expect(runNonInteractive(ctx, services)).rejects.toMatchObject({
      kind: "git-init-failed",
    });
  });
});
