import { describe, expect, test } from "vite-plus/test";

import {
  commandManifestPathToKey,
  createCommandManifestNodeMap,
} from "../../src/manifest/manifest-map";
import { commandNode, groupNode, manifest as buildManifest } from "./helpers";

describe("commandManifestPathToKey", () => {
  test("returns an empty string for the root path", () => {
    expect(commandManifestPathToKey([])).toBe("");
  });

  test("returns the segment as-is for a single-segment path", () => {
    expect(commandManifestPathToKey(["hello"])).toBe("hello");
  });

  test("joins multiple segments with a single space", () => {
    expect(commandManifestPathToKey(["admin", "users", "create"])).toBe("admin users create");
  });
});

describe("createCommandManifestNodeMap", () => {
  test("indexes every node by its canonical joined path key", () => {
    const manifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({ pathSegments: ["project"], childNames: ["create"] }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/tmp/project/create.mjs",
      }),
    ]);

    const map = createCommandManifestNodeMap(manifest);

    expect(Object.keys(map).sort()).toEqual(["", "project", "project create"]);
    expect(map[""]).toBe(manifest.nodes[0]);
    expect(map["project"]).toBe(manifest.nodes[1]);
    expect(map["project create"]).toBe(manifest.nodes[2]);
  });

  test("registers each alias under its parent's canonical path", () => {
    const manifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/tmp/deploy.mjs",
        aliases: ["d", "dep"],
      }),
    ]);

    const map = createCommandManifestNodeMap(manifest);

    expect(map["deploy"]).toBe(manifest.nodes[1]);
    expect(map["d"]).toBe(manifest.nodes[1]);
    expect(map["dep"]).toBe(manifest.nodes[1]);
  });

  test("registers nested aliases keeping ancestor segments canonical", () => {
    const manifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({ pathSegments: ["project"], childNames: ["create"] }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/tmp/project/create.mjs",
        aliases: ["c", "new"],
      }),
    ]);

    const map = createCommandManifestNodeMap(manifest);

    expect(map["project create"]).toBe(manifest.nodes[2]);
    expect(map["project c"]).toBe(manifest.nodes[2]);
    expect(map["project new"]).toBe(manifest.nodes[2]);
  });

  test("ignores aliases on the root node", () => {
    const manifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["hello"], aliases: ["r"] }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: "/tmp/hello.mjs",
      }),
    ]);

    const map = createCommandManifestNodeMap(manifest);

    expect(Object.keys(map).sort()).toEqual(["", "hello"]);
  });
});
