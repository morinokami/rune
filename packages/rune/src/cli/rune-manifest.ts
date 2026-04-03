import type { CommandArgField, CommandOptionField, DefinedCommand } from "@rune-cli/core";

import type { CommandManifest } from "../manifest/manifest-types";
import type { LoadCommandFn } from "../manifest/runtime/command-loader";

import { runeBuildCommand, runeRunCommand } from "./rune-commands";

const runeCommandMap: Record<
  string,
  DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>
> = {
  build: runeBuildCommand,
  run: runeRunCommand,
};

export function createRuneCliManifest(): CommandManifest {
  return {
    nodes: [
      {
        kind: "group",
        pathSegments: [],
        childNames: ["build", "run"],
        aliases: [],
      },
      {
        kind: "command",
        pathSegments: ["build"],
        childNames: [],
        aliases: [],
        description: runeBuildCommand.description,
        sourceFilePath: "",
      },
      {
        kind: "command",
        pathSegments: ["run"],
        childNames: [],
        aliases: [],
        description: runeRunCommand.description,
        sourceFilePath: "",
      },
    ],
  };
}

export const loadRuneCommand: LoadCommandFn = async (node) => {
  const name = node.pathSegments.at(-1);
  const command = name ? runeCommandMap[name] : undefined;

  if (!command) {
    throw new Error(`Unknown Rune CLI command: ${node.pathSegments.join(" ")}`);
  }

  return command;
};
