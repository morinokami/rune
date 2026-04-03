import { defineCommand } from "@rune-cli/core";

export const runeRunCommand = defineCommand({
  description: "Run a Rune project directly from source",
  options: [
    {
      name: "project",
      type: "string" as const,
      description: "Path to the Rune project root (default: current directory)",
    },
  ],
  examples: ["rune run hello", "rune run --project ./my-app hello"],
  run() {
    // Not called. This definition exists only for help metadata.
  },
});

export const runeBuildCommand = defineCommand({
  description: "Build a Rune project into a distributable CLI",
  options: [
    {
      name: "project",
      type: "string" as const,
      description: "Path to the Rune project root (default: current directory)",
    },
  ],
  examples: ["rune build", "rune build --project ./my-app"],
  run() {
    // Not called. This definition exists only for help metadata.
  },
});
