import assert from "node:assert/strict";
import { describe, expect, test } from "vite-plus/test";

import { resolveCommandRoute } from "../../../src/manifest/runtime/resolve-command-route";
import { commandNode, groupNode, manifest as buildManifest } from "../../helpers";

const manifest = buildManifest([
  groupNode({ pathSegments: [], childNames: ["hello", "project", "user"] }),
  commandNode({
    pathSegments: ["hello"],
    sourceFilePath: "/commands/hello/index.ts",
    description: "Say hello",
  }),
  commandNode({
    pathSegments: ["project"],
    sourceFilePath: "/commands/project/index.ts",
    childNames: ["create", "list"],
    description: "Project commands",
  }),
  commandNode({
    pathSegments: ["project", "create"],
    sourceFilePath: "/commands/project/create/index.ts",
    description: "Create a project",
  }),
  commandNode({
    pathSegments: ["project", "list"],
    sourceFilePath: "/commands/project/list/index.ts",
    description: "List projects",
  }),
  groupNode({ pathSegments: ["user"], childNames: ["delete"] }),
  commandNode({
    pathSegments: ["user", "delete"],
    sourceFilePath: "/commands/user/delete/index.ts",
    description: "Delete a user",
  }),
]);

describe("command and group resolution", () => {
  test("resolveCommandRoute resolves executable commands and preserves remaining argv", () => {
    const result = resolveCommandRoute(manifest, ["project", "create", "--help"]);

    expect(result).toEqual({
      kind: "command",
      node: manifest.nodes[3],
      matchedPath: ["project", "create"],
      remainingArgs: ["--help"],
      helpRequested: true,
    });
  });

  test("resolveCommandRoute returns the root group for empty argv", () => {
    const result = resolveCommandRoute(manifest, []);

    expect(result).toEqual({
      kind: "group",
      node: manifest.nodes[0],
      matchedPath: [],
      remainingArgs: [],
      helpRequested: false,
    });
  });

  test("resolveCommandRoute treats unmatched root tokens as command args when the root is executable", () => {
    const rootExecutableManifest = buildManifest([
      commandNode({
        pathSegments: [],
        sourceFilePath: "/commands/index.ts",
        childNames: ["hello"],
        description: "Create a project",
      }),
      commandNode({
        pathSegments: ["hello"],
        sourceFilePath: "/commands/hello/index.ts",
        description: "Say hello",
      }),
    ]);

    expect(resolveCommandRoute(rootExecutableManifest, ["mycli"])).toEqual({
      kind: "command",
      node: rootExecutableManifest.nodes[0],
      matchedPath: [],
      remainingArgs: ["mycli"],
      helpRequested: false,
    });
  });

  test("resolveCommandRoute treats root help as a group-help request", () => {
    const result = resolveCommandRoute(manifest, ["--help"]);

    expect(result).toEqual({
      kind: "group",
      node: manifest.nodes[0],
      matchedPath: [],
      remainingArgs: ["--help"],
      helpRequested: true,
    });
  });

  test("resolveCommandRoute ignores help flags after the argument terminator", () => {
    const result = resolveCommandRoute(manifest, ["project", "create", "--", "--help"]);

    expect(result).toEqual({
      kind: "command",
      node: manifest.nodes[3],
      matchedPath: ["project", "create"],
      remainingArgs: ["--", "--help"],
      helpRequested: false,
    });
  });

  test("resolveCommandRoute resolves group nodes without importing subcommands", () => {
    const result = resolveCommandRoute(manifest, ["user"]);

    expect(result).toEqual({
      kind: "group",
      node: manifest.nodes[5],
      matchedPath: ["user"],
      remainingArgs: [],
      helpRequested: false,
    });
  });
});

describe("suggestions", () => {
  test("resolveCommandRoute suggests adjacent transposition typos", () => {
    const result = resolveCommandRoute(manifest, ["project", "cerate"]);

    expect(result).toEqual({
      kind: "unknown",
      attemptedPath: ["project", "cerate"],
      matchedPath: ["project"],
      unknownSegment: "cerate",
      availableChildNames: ["create", "list"],
      suggestions: ["create"],
    });
  });

  test("resolveCommandRoute scopes suggestions to sibling commands only", () => {
    const result = resolveCommandRoute(manifest, ["project", "cretae"]);

    expect(result).toEqual({
      kind: "unknown",
      attemptedPath: ["project", "cretae"],
      matchedPath: ["project"],
      unknownSegment: "cretae",
      availableChildNames: ["create", "list"],
      suggestions: ["create"],
    });
  });

  test("resolveCommandRoute does not suggest unrelated root commands", () => {
    const result = resolveCommandRoute(manifest, ["zzzzz"]);

    expect(result).toEqual({
      kind: "unknown",
      attemptedPath: ["zzzzz"],
      matchedPath: [],
      unknownSegment: "zzzzz",
      availableChildNames: ["hello", "project", "user"],
      suggestions: [],
    });
  });
});

describe("argument passthrough", () => {
  test("resolveCommandRoute treats unmatched tokens after a command as command argv", () => {
    const result = resolveCommandRoute(manifest, ["project", "123"]);

    expect(result).toEqual({
      kind: "command",
      node: manifest.nodes[2],
      matchedPath: ["project"],
      remainingArgs: ["123"],
      helpRequested: false,
    });
  });
});

describe("alias routing", () => {
  test("resolveCommandRoute resolves command aliases", () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy", "dev"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["d"],
        description: "Deploy the app",
      }),
      commandNode({
        pathSegments: ["dev"],
        sourceFilePath: "/commands/dev.ts",
        description: "Start dev server",
      }),
    ]);

    const result = resolveCommandRoute(aliasManifest, ["d"]);

    expect(result).toEqual({
      kind: "command",
      node: aliasManifest.nodes[1],
      matchedPath: ["deploy"],
      remainingArgs: [],
      helpRequested: false,
    });
  });

  test("resolveCommandRoute resolves group aliases and child commands through them", () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["project"] }),
      groupNode({
        pathSegments: ["project"],
        childNames: ["create"],
        aliases: ["p"],
        description: "Manage projects",
      }),
      commandNode({
        pathSegments: ["project", "create"],
        sourceFilePath: "/commands/project/create.ts",
        aliases: ["c"],
        description: "Create a project",
      }),
    ]);

    const groupResult = resolveCommandRoute(aliasManifest, ["p"]);
    expect(groupResult).toEqual({
      kind: "group",
      node: aliasManifest.nodes[1],
      matchedPath: ["project"],
      remainingArgs: [],
      helpRequested: false,
    });

    const childResult = resolveCommandRoute(aliasManifest, ["p", "create"]);
    expect(childResult).toEqual({
      kind: "command",
      node: aliasManifest.nodes[2],
      matchedPath: ["project", "create"],
      remainingArgs: [],
      helpRequested: false,
    });

    const aliasChainResult = resolveCommandRoute(aliasManifest, ["p", "c"]);
    expect(aliasChainResult).toEqual({
      kind: "command",
      node: aliasManifest.nodes[2],
      matchedPath: ["project", "create"],
      remainingArgs: [],
      helpRequested: false,
    });
  });

  test("resolveCommandRoute includes aliases in suggestion candidates", () => {
    const aliasManifest = buildManifest([
      groupNode({ pathSegments: [], childNames: ["deploy"] }),
      commandNode({
        pathSegments: ["deploy"],
        sourceFilePath: "/commands/deploy.ts",
        aliases: ["dep"],
        description: "Deploy the app",
      }),
    ]);

    const result = resolveCommandRoute(aliasManifest, ["depl"]);

    expect(result.kind).toBe("unknown");
    assert(result.kind === "unknown");
    expect(result.suggestions).toContain("deploy");
  });
});
