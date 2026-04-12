import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { findConflictingEntries, scaffoldProject } from "../src/services/index.ts";
import { cleanupTempDirs, createTempDir } from "./test-helpers.ts";

afterEach(async () => {
  await cleanupTempDirs();
});

describe("findConflictingEntries", () => {
  test("returns empty for an empty directory", async () => {
    const dir = await createTempDir();
    expect(await findConflictingEntries(dir)).toEqual([]);
  });

  test("detects top-level template entries that already exist", async () => {
    const dir = await createTempDir();
    await writeFile(path.join(dir, "package.json"), "{}");
    await mkdir(path.join(dir, "src"));

    const conflicts = await findConflictingEntries(dir);

    expect(conflicts).toContain("package.json");
    expect(conflicts).toContain("src");
  });
});

describe("scaffoldProject guards", () => {
  test("rejects when the target directory already exists", async () => {
    const cwd = await createTempDir();
    await mkdir(path.join(cwd, "existing"));

    await expect(scaffoldProject("existing", cwd)).rejects.toThrow(/already exists/);
  });

  test("rejects '.' when the current directory has conflicts", async () => {
    const cwd = await createTempDir();
    await writeFile(path.join(cwd, "package.json"), "{}");

    await expect(scaffoldProject(".", cwd)).rejects.toThrow(/conflicting files/);
  });
});
