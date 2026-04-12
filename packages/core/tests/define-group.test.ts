import { describe, expect, test } from "vite-plus/test";

import { defineGroup } from "../src";

describe("normalization and pass-through", () => {
  test("defineGroup normalizes omitted aliases and examples to empty arrays", () => {
    const group = defineGroup({
      description: "Manage projects",
    });

    expect(group.aliases).toEqual([]);
    expect(group.examples).toEqual([]);
  });

  test("defineGroup preserves description, aliases, and examples", () => {
    const group = defineGroup({
      description: "Manage projects",
      aliases: ["project", "projects"],
      examples: ["my-cli project create", "my-cli projects list"],
    });

    expect(group).toEqual({
      description: "Manage projects",
      aliases: ["project", "projects"],
      examples: ["my-cli project create", "my-cli projects list"],
    });
  });
});

describe("alias validation", () => {
  test("defineGroup accepts valid command aliases", () => {
    expect(() =>
      defineGroup({
        description: "Manage projects",
        aliases: ["project", "new-project", "v2"],
      }),
    ).not.toThrow();
  });

  test("defineGroup rejects invalid command aliases", () => {
    expect(() =>
      defineGroup({
        description: "Manage projects",
        aliases: ["ProjectGroup"],
      }),
    ).toThrow(
      'Invalid command alias "ProjectGroup". Aliases must be lowercase kebab-case (letters, digits, and internal hyphens).',
    );
  });

  test("defineGroup rejects duplicate command aliases", () => {
    expect(() =>
      defineGroup({
        description: "Manage projects",
        aliases: ["project", "project"],
      }),
    ).toThrow('Duplicate command alias "project".');
  });
});
