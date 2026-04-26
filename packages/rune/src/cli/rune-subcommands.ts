import type { DefinedCommand } from "../core/command-types";
import type { CommandArgField, CommandOptionField } from "../core/field-types";
import type { CommandManifest, LoadCommandFn } from "../manifest/manifest-types";
import type { EarlyExit } from "./rune-options";

import { defineCommand } from "../core/define-command";
import { runBuildCommand } from "./build-command";
import { isRuneHelpRequested, parseBuildArgs, parseRunArgs } from "./parse-rune-subcommand-args";
import { runRunCommand } from "./run-command";

export interface RuneSubcommandDispatchContext {
  readonly cwd?: string | undefined;
}

interface RuneSubcommandInvocation {
  readonly ok: true;
  readonly run: (context: RuneSubcommandDispatchContext) => Promise<number>;
}

export interface RuneSubcommandDescriptor {
  readonly name: string;
  readonly command: DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>;
  readonly isHelpRequested: (remainingArgs: readonly string[]) => boolean;
  readonly resolveInvocation: (
    remainingArgs: readonly string[],
  ) => RuneSubcommandInvocation | EarlyExit;
}

export function getRuneSubcommand(name: string | undefined): RuneSubcommandDescriptor | undefined {
  return runeSubcommands.find((descriptor) => descriptor.name === name);
}

export function createRuneCliManifest(): CommandManifest {
  return {
    nodes: [
      {
        kind: "group",
        pathSegments: [],
        childNames: runeSubcommands.map((descriptor) => descriptor.name),
        aliases: [],
      },
      ...runeSubcommands.map((descriptor) => ({
        kind: "command" as const,
        pathSegments: [descriptor.name],
        childNames: [],
        aliases: [],
        description: descriptor.command.description,
        sourceFilePath: "",
      })),
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

const runeRunCommand = defineCommand({
  description: "Run a Rune project directly from source",
  options: [
    {
      name: "project",
      type: "string",
      description: "Path to the Rune project root (default: current directory)",
    },
  ],
  examples: ["rune run hello", "rune run --project ./my-app hello"],
  run() {
    // Not called. This definition exists only for help metadata.
  },
});

const runeBuildCommand = defineCommand({
  description: "Build a Rune project into a distributable CLI",
  options: [
    {
      name: "project",
      type: "string",
      description: "Path to the Rune project root (default: current directory)",
    },
  ],
  examples: ["rune build", "rune build --project ./my-app"],
  run() {
    // Not called. This definition exists only for help metadata.
  },
});

const runeSubcommands: readonly RuneSubcommandDescriptor[] = [
  {
    name: "build",
    command: runeBuildCommand,
    isHelpRequested: isRuneHelpRequested,
    resolveInvocation(remainingArgs) {
      const parsedBuildArgs = parseBuildArgs(remainingArgs);

      if (!parsedBuildArgs.ok) {
        return parsedBuildArgs;
      }

      return {
        ok: true,
        run: ({ cwd }) =>
          runBuildCommand({
            projectPath: parsedBuildArgs.projectPath,
            cwd,
          }),
      };
    },
  },
  {
    name: "run",
    command: runeRunCommand,
    isHelpRequested: isRuneHelpRequested,
    resolveInvocation(remainingArgs) {
      const parsedRunArgs = parseRunArgs(remainingArgs);

      if (!parsedRunArgs.ok) {
        return parsedRunArgs;
      }

      return {
        ok: true,
        run: ({ cwd }) =>
          runRunCommand({
            rawArgs: parsedRunArgs.commandArgs,
            projectPath: parsedRunArgs.projectPath,
            cwd,
          }),
      };
    },
  },
];

const runeCommandMap: Readonly<
  Record<string, DefinedCommand<readonly CommandArgField[], readonly CommandOptionField[]>>
> = Object.fromEntries(runeSubcommands.map((descriptor) => [descriptor.name, descriptor.command]));
