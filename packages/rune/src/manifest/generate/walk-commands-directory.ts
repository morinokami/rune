import { readdir } from "node:fs/promises";
import path from "node:path";

import type { CommandManifestNode, CommandManifestPath } from "../manifest-types";

import { validateGroupMetaFile } from "./validate-group-meta";

const COMMAND_ENTRY_FILE = "index.ts";
const GROUP_META_FILE = "_group.ts";
const BARE_COMMAND_EXTENSION = ".ts";
const DECLARATION_FILE_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

export interface WalkDirectoryResult {
  readonly nodes: readonly CommandManifestNode[];
  readonly hasNode: boolean;
}

export type ExtractDescriptionFn = (sourceFilePath: string) => Promise<string | undefined>;

export function comparePathSegments(left: CommandManifestPath, right: CommandManifestPath): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const comparison = left[index].localeCompare(right[index]);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length - right.length;
}

export async function walkCommandsDirectory(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  extractDescription: ExtractDescriptionFn,
): Promise<WalkDirectoryResult> {
  const entries = await readdir(absoluteDirectoryPath, { withFileTypes: true });

  const childDirectoryNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const childResults = await Promise.all(
    childDirectoryNames.map(async (directoryName) => {
      const childDirectoryPath = path.join(absoluteDirectoryPath, directoryName);
      const childResult = await walkCommandsDirectory(
        childDirectoryPath,
        [...pathSegments, directoryName],
        extractDescription,
      );

      return {
        directoryName,
        result: childResult,
      };
    }),
  );

  const bareCommandFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(BARE_COMMAND_EXTENSION) &&
        entry.name !== COMMAND_ENTRY_FILE &&
        entry.name !== GROUP_META_FILE &&
        !DECLARATION_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix)),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const childDirectoriesWithNodes = new Set(
    childResults.filter(({ result }) => result.hasNode).map(({ directoryName }) => directoryName),
  );

  const bareCommandNodes = await Promise.all(
    bareCommandFiles.map(async (fileName) => {
      const commandName = fileName.slice(0, -BARE_COMMAND_EXTENSION.length);

      if (childDirectoriesWithNodes.has(commandName)) {
        throw new Error(
          `Conflicting command definitions: both "${commandName}${BARE_COMMAND_EXTENSION}" and "${commandName}/" exist. A bare command file cannot coexist with a command directory.`,
        );
      }

      const sourceFilePath = path.join(absoluteDirectoryPath, fileName);

      return {
        pathSegments: [...pathSegments, commandName],
        kind: "command" as const,
        sourceFilePath,
        childNames: [] as string[],
        description: await extractDescription(sourceFilePath),
      };
    }),
  );

  const childNodes = childResults.flatMap(({ result }) => result.nodes);
  const childNames = [
    ...childResults
      .filter(({ result }) => result.hasNode)
      .map(({ directoryName }) => directoryName),
    ...bareCommandFiles.map((fileName) => fileName.slice(0, -BARE_COMMAND_EXTENSION.length)),
  ].sort((left, right) => left.localeCompare(right));

  const hasCommandEntry = entries.some(
    (entry) => entry.isFile() && entry.name === COMMAND_ENTRY_FILE,
  );
  const hasGroupMeta = entries.some((entry) => entry.isFile() && entry.name === GROUP_META_FILE);

  if (hasGroupMeta && hasCommandEntry) {
    throw new Error(
      `Conflicting definitions: both "${GROUP_META_FILE}" and "${COMMAND_ENTRY_FILE}" exist in the same directory. A directory is either a group (_group.ts) or an executable command (index.ts), not both.`,
    );
  }

  if (hasGroupMeta && childNames.length === 0) {
    throw new Error(
      `${path.join(absoluteDirectoryPath, GROUP_META_FILE)}: _group.ts exists but the directory has no subcommands.`,
    );
  }

  if (!hasCommandEntry && !hasGroupMeta && childNames.length === 0) {
    return {
      nodes: [...childNodes, ...bareCommandNodes],
      hasNode: false,
    };
  }

  let node: CommandManifestNode;

  if (hasCommandEntry) {
    const sourceFilePath = path.join(absoluteDirectoryPath, COMMAND_ENTRY_FILE);

    node = {
      pathSegments,
      kind: "command",
      sourceFilePath,
      childNames,
      description: await extractDescription(sourceFilePath),
    };
  } else {
    const groupMetaPath = path.join(absoluteDirectoryPath, GROUP_META_FILE);

    if (hasGroupMeta) {
      await validateGroupMetaFile(groupMetaPath);
    }

    const description = hasGroupMeta ? await extractDescription(groupMetaPath) : undefined;

    if (hasGroupMeta && !description) {
      throw new Error(
        `${groupMetaPath}: _group.ts must export a defineGroup() call with a non-empty "description" string.`,
      );
    }

    node = {
      pathSegments,
      kind: "group",
      childNames,
      ...(description !== undefined ? { description } : {}),
    };
  }

  return {
    nodes: [node, ...childNodes, ...bareCommandNodes],
    hasNode: true,
  };
}
