import assert from "node:assert/strict";
import { describe, expect, test } from "vite-plus/test";

import type { CommandManifest } from "../src/manifest/manifest-types";

import { resolveCommandRoute } from "../src/manifest/runtime/resolve-command-route";

const manifest: CommandManifest = {
  nodes: [
    {
      pathSegments: [],
      kind: "group",
      childNames: ["hello", "project", "user"],
      aliases: [],
    },
    {
      pathSegments: ["hello"],
      kind: "command",
      sourceFilePath: "/commands/hello/index.ts",
      childNames: [],
      aliases: [],
      description: "Say hello",
    },
    {
      pathSegments: ["project"],
      kind: "command",
      sourceFilePath: "/commands/project/index.ts",
      childNames: ["create", "list"],
      aliases: [],
      description: "Project commands",
    },
    {
      pathSegments: ["project", "create"],
      kind: "command",
      sourceFilePath: "/commands/project/create/index.ts",
      childNames: [],
      aliases: [],
      description: "Create a project",
    },
    {
      pathSegments: ["project", "list"],
      kind: "command",
      sourceFilePath: "/commands/project/list/index.ts",
      childNames: [],
      aliases: [],
      description: "List projects",
    },
    {
      pathSegments: ["user"],
      kind: "group",
      childNames: ["delete"],
      aliases: [],
    },
    {
      pathSegments: ["user", "delete"],
      kind: "command",
      sourceFilePath: "/commands/user/delete/index.ts",
      childNames: [],
      aliases: [],
      description: "Delete a user",
    },
  ],
};

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
    const manifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "command",
          sourceFilePath: "/commands/index.ts",
          childNames: ["hello"],
          aliases: [],
          description: "Create a project",
        },
        {
          pathSegments: ["hello"],
          kind: "command",
          sourceFilePath: "/commands/hello/index.ts",
          childNames: [],
          aliases: [],
          description: "Say hello",
        },
      ],
    };

    expect(resolveCommandRoute(manifest, ["mycli"])).toEqual({
      kind: "command",
      node: manifest.nodes[0],
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
    const aliasManifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          childNames: ["deploy", "dev"],
          aliases: [],
        },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["d"],
          description: "Deploy the app",
        },
        {
          pathSegments: ["dev"],
          kind: "command",
          sourceFilePath: "/commands/dev.ts",
          childNames: [],
          aliases: [],
          description: "Start dev server",
        },
      ],
    };

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
    const aliasManifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          childNames: ["project"],
          aliases: [],
        },
        {
          pathSegments: ["project"],
          kind: "group",
          childNames: ["create"],
          aliases: ["p"],
          description: "Manage projects",
        },
        {
          pathSegments: ["project", "create"],
          kind: "command",
          sourceFilePath: "/commands/project/create.ts",
          childNames: [],
          aliases: ["c"],
          description: "Create a project",
        },
      ],
    };

    // Group alias
    const groupResult = resolveCommandRoute(aliasManifest, ["p"]);

    expect(groupResult).toEqual({
      kind: "group",
      node: aliasManifest.nodes[1],
      matchedPath: ["project"],
      remainingArgs: [],
      helpRequested: false,
    });

    // Group alias + child canonical name
    const childResult = resolveCommandRoute(aliasManifest, ["p", "create"]);

    expect(childResult).toEqual({
      kind: "command",
      node: aliasManifest.nodes[2],
      matchedPath: ["project", "create"],
      remainingArgs: [],
      helpRequested: false,
    });

    // Group alias + child alias
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
    const aliasManifest: CommandManifest = {
      nodes: [
        {
          pathSegments: [],
          kind: "group",
          childNames: ["deploy"],
          aliases: [],
        },
        {
          pathSegments: ["deploy"],
          kind: "command",
          sourceFilePath: "/commands/deploy.ts",
          childNames: [],
          aliases: ["dep"],
          description: "Deploy the app",
        },
      ],
    };

    // "depl" is close to "dep" (alias) and "deploy" (canonical)
    const result = resolveCommandRoute(aliasManifest, ["depl"]);

    expect(result.kind).toBe("unknown");
    assert(result.kind === "unknown");

    // Suggestions should use canonical name
    expect(result.suggestions).toContain("deploy");
  });
});
