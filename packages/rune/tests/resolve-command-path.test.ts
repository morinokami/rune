import { expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { resolveCommandPath } from "../src/manifest/runtime/resolve-command-path";

const manifest: CommandManifest = {
  nodes: [
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello", "project", "user"],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: "/commands/hello/index.ts",
      childNames: [],
      description: "Say hello",
    },
    {
      pathSegments: ["project"],
      kind: "command",
      sourceFilePath: "/commands/project/index.ts",
      childNames: ["create", "list"],
      description: "Project commands",
    },
    {
      pathSegments: ["project", "create"],
      kind: "command",
      sourceFilePath: "/commands/project/create/index.ts",
      childNames: [],
      description: "Create a project",
    },
    {
      pathSegments: ["project", "list"],
      kind: "command",
      sourceFilePath: "/commands/project/list/index.ts",
      childNames: [],
      description: "List projects",
    },
    {
      pathSegments: ["user"],
      kind: "group",
      childNames: ["delete"],
    },
    {
      pathSegments: ["user", "delete"],
      kind: "command",
      sourceFilePath: "/commands/user/delete/index.ts",
      childNames: [],
      description: "Delete a user",
    },
  ],
};

// ---------------------------------------------------------------------------
// Command and group resolution
// ---------------------------------------------------------------------------

test("resolveCommandPath resolves executable commands and preserves remaining argv", () => {
  const result = resolveCommandPath(manifest, ["project", "create", "--help"]);

  expect(result).toEqual({
    kind: "command",
    node: manifest.nodes[3],
    matchedPath: ["project", "create"],
    remainingArgs: ["--help"],
    helpRequested: true,
  });
});

test("resolveCommandPath returns the root group for empty argv", () => {
  const result = resolveCommandPath(manifest, []);

  expect(result).toEqual({
    kind: "group",
    node: manifest.nodes[0],
    matchedPath: [],
    remainingArgs: [],
    helpRequested: false,
  });
});

test("resolveCommandPath treats unmatched root tokens as command args when the root is executable", () => {
  const manifest: CommandManifest = {
    nodes: [
      {
        pathSegments: [],
        kind: "command",
        sourceFilePath: "/commands/index.ts",
        childNames: ["hello"],
        description: "Create a project",
      },
      {
        pathSegments: ["hello"],
        kind: "command",
        sourceFilePath: "/commands/hello/index.ts",
        childNames: [],
        description: "Say hello",
      },
    ],
  };

  expect(resolveCommandPath(manifest, ["mycli"])).toEqual({
    kind: "command",
    node: manifest.nodes[0],
    matchedPath: [],
    remainingArgs: ["mycli"],
    helpRequested: false,
  });
});

test("resolveCommandPath treats root help as a group-help request", () => {
  const result = resolveCommandPath(manifest, ["--help"]);

  expect(result).toEqual({
    kind: "group",
    node: manifest.nodes[0],
    matchedPath: [],
    remainingArgs: ["--help"],
    helpRequested: true,
  });
});

test("resolveCommandPath resolves group nodes without importing subcommands", () => {
  const result = resolveCommandPath(manifest, ["user"]);

  expect(result).toEqual({
    kind: "group",
    node: manifest.nodes[5],
    matchedPath: ["user"],
    remainingArgs: [],
    helpRequested: false,
  });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

test("resolveCommandPath suggests adjacent transposition typos", () => {
  const result = resolveCommandPath(manifest, ["project", "cerate"]);

  expect(result).toEqual({
    kind: "unknown",
    attemptedPath: ["project", "cerate"],
    matchedPath: ["project"],
    unknownSegment: "cerate",
    availableChildNames: ["create", "list"],
    suggestions: ["create"],
  });
});

test("resolveCommandPath scopes suggestions to sibling commands only", () => {
  const result = resolveCommandPath(manifest, ["project", "cretae"]);

  expect(result).toEqual({
    kind: "unknown",
    attemptedPath: ["project", "cretae"],
    matchedPath: ["project"],
    unknownSegment: "cretae",
    availableChildNames: ["create", "list"],
    suggestions: ["create"],
  });
});

test("resolveCommandPath does not suggest unrelated root commands", () => {
  const result = resolveCommandPath(manifest, ["zzzzz"]);

  expect(result).toEqual({
    kind: "unknown",
    attemptedPath: ["zzzzz"],
    matchedPath: [],
    unknownSegment: "zzzzz",
    availableChildNames: ["hello", "project", "user"],
    suggestions: [],
  });
});

// ---------------------------------------------------------------------------
// Argument passthrough
// ---------------------------------------------------------------------------

test("resolveCommandPath treats unmatched tokens after a command as command argv", () => {
  const result = resolveCommandPath(manifest, ["project", "123"]);

  expect(result).toEqual({
    kind: "command",
    node: manifest.nodes[2],
    matchedPath: ["project"],
    remainingArgs: ["123"],
    helpRequested: false,
  });
});
