import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { getProvidedProjectState, wasExplicitlyPassed } from "../src/plan.ts";
import { cleanupTempDirs, createTempDir } from "./test-helpers.ts";

afterEach(async () => {
  await cleanupTempDirs();
});

describe("getProvidedProjectState", () => {
  test("returns 'none' when projectName is undefined", () => {
    const state = getProvidedProjectState("/tmp", undefined);
    expect(state).toEqual({ kind: "none", name: undefined, root: undefined });
  });

  test("returns 'none' for whitespace-only name", () => {
    const state = getProvidedProjectState("/tmp", "   ");
    expect(state.kind).toBe("none");
  });

  test("returns 'current-dir' for '.'", () => {
    const state = getProvidedProjectState("/tmp", ".");
    expect(state).toEqual({ kind: "current-dir", name: ".", root: "/tmp" });
  });

  test("returns 'current-dir' for './'", () => {
    const state = getProvidedProjectState("/tmp", "./");
    expect(state.kind).toBe("current-dir");
  });

  test("returns 'existing' when the target directory already exists", async () => {
    const cwd = await createTempDir();
    const state = getProvidedProjectState(path.dirname(cwd), path.basename(cwd));
    expect(state.kind).toBe("existing");
    expect(state.root).toBe(cwd);
  });

  test("returns 'available' when the target directory does not exist", async () => {
    const cwd = await createTempDir();
    const state = getProvidedProjectState(cwd, "fresh-name");
    expect(state).toEqual({
      kind: "available",
      name: "fresh-name",
      root: path.join(cwd, "fresh-name"),
    });
  });
});

describe("wasExplicitlyPassed", () => {
  test("detects --name", () => {
    expect(wasExplicitlyPassed(["--install"], "install")).toBe(true);
  });

  test("detects --no-name", () => {
    expect(wasExplicitlyPassed(["--no-git"], "git")).toBe(true);
  });

  test("returns false when absent", () => {
    expect(wasExplicitlyPassed(["my-app", "--yes"], "install")).toBe(false);
  });

  test("does not match substrings", () => {
    expect(wasExplicitlyPassed(["--installer"], "install")).toBe(false);
  });
});
