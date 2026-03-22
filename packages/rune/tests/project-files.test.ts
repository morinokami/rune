import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";

import { readProjectCliInfo } from "../src/project/project-files";

const fixtureRootDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...fixtureRootDirectories].map((rootDirectory) =>
      rm(rootDirectory, { recursive: true, force: true }),
    ),
  );
  fixtureRootDirectories.clear();
});

async function createProjectFixture(files: Readonly<Record<string, string>>): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "rune-project-files-"));
  fixtureRootDirectories.add(projectRoot);

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(projectRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }),
  );

  return projectRoot;
}

test("readProjectCliInfo prefers the sorted bin object key", async () => {
  const projectRoot = await createProjectFixture({
    "package.json": JSON.stringify(
      {
        name: "@scope/mycli",
        version: "2.0.0",
        bin: {
          zebra: "./dist/zebra.mjs",
          alpha: "./dist/alpha.mjs",
        },
      },
      null,
      2,
    ),
  });

  await expect(readProjectCliInfo(projectRoot)).resolves.toEqual({
    name: "alpha",
    version: "2.0.0",
  });
});

test("readProjectCliInfo falls back to the package name when bin is a string", async () => {
  const projectRoot = await createProjectFixture({
    "package.json": JSON.stringify(
      {
        name: "@scope/mycli",
        version: "1.0.0",
        bin: "./dist/cli.mjs",
      },
      null,
      2,
    ),
  });

  await expect(readProjectCliInfo(projectRoot)).resolves.toEqual({
    name: "mycli",
    version: "1.0.0",
  });
});

test("readProjectCliInfo falls back to the package name when no bin field exists", async () => {
  const projectRoot = await createProjectFixture({
    "package.json": JSON.stringify({ name: "@scope/mycli", version: "0.1.0" }, null, 2),
  });

  await expect(readProjectCliInfo(projectRoot)).resolves.toEqual({
    name: "mycli",
    version: "0.1.0",
  });
});

test("readProjectCliInfo returns undefined version when version is not set", async () => {
  const projectRoot = await createProjectFixture({
    "package.json": JSON.stringify({ name: "mycli" }, null, 2),
  });

  await expect(readProjectCliInfo(projectRoot)).resolves.toEqual({
    name: "mycli",
    version: undefined,
  });
});

test("readProjectCliInfo falls back to the project directory name when package.json is missing", async () => {
  const projectRoot = await createProjectFixture({});

  await expect(readProjectCliInfo(projectRoot)).resolves.toEqual({
    name: path.basename(projectRoot),
    version: undefined,
  });
});
