import type { Dirent } from "node:fs";

import { readdir } from "node:fs/promises";
import path from "node:path";

import type { CommandManifestNode, CommandManifestPath } from "../manifest-types";
import type { CommandMetadata } from "./extract-description";

import { validateGroupMetaFile } from "./validate-group-meta";

export interface WalkDirectoryResult {
  readonly nodes: readonly CommandManifestNode[];
  readonly hasNode: boolean;
}

export type ExtractMetadataFn = (sourceFilePath: string) => Promise<CommandMetadata | undefined>;

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
  extractMetadata: ExtractMetadataFn,
): Promise<WalkDirectoryResult> {
  const directoryScan = await scanCommandDirectory(
    absoluteDirectoryPath,
    pathSegments,
    extractMetadata,
  );
  const bareCommandNodes = await buildBareCommandNodes(
    absoluteDirectoryPath,
    pathSegments,
    directoryScan,
    extractMetadata,
  );
  const directoryAggregation = aggregateDirectoryScan(directoryScan);

  validateDirectoryAggregation(absoluteDirectoryPath, directoryAggregation);

  // No index.ts, no _group.ts, no children — this directory is not a node itself.
  if (!shouldEmitDirectoryNode(directoryAggregation)) {
    return {
      nodes: [...directoryAggregation.descendantNodes, ...bareCommandNodes],
      hasNode: false,
    };
  }

  const node = await buildDirectoryNode(
    absoluteDirectoryPath,
    pathSegments,
    directoryAggregation,
    extractMetadata,
  );

  validateSiblingAliases(
    collectSiblingEntries(directoryScan.childResults, bareCommandNodes, pathSegments),
  );

  return {
    nodes: [node, ...directoryAggregation.descendantNodes, ...bareCommandNodes],
    hasNode: true,
  };
}

const COMMAND_ENTRY_FILE = "index.ts";
const GROUP_META_FILE = "_group.ts";
const BARE_COMMAND_EXTENSION = ".ts";
const DECLARATION_FILE_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];
const TEST_COMMAND_NAME_SUFFIXES = [".test", ".spec"];

interface ChildDirectoryWalkResult {
  readonly directoryName: string;
  readonly walkResult: WalkDirectoryResult;
}

interface DirectoryScan {
  readonly childResults: readonly ChildDirectoryWalkResult[];
  readonly bareCommandFileNames: readonly string[];
  readonly hasCommandEntry: boolean;
  readonly hasGroupMeta: boolean;
}

interface DirectoryAggregation extends DirectoryScan {
  readonly descendantNodes: readonly CommandManifestNode[];
  readonly childNames: readonly string[];
}

interface SiblingEntry {
  readonly name: string;
  readonly aliases: readonly string[];
}

async function scanCommandDirectory(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  extractMetadata: ExtractMetadataFn,
): Promise<DirectoryScan> {
  const dirEntries = await readdir(absoluteDirectoryPath, { withFileTypes: true });
  const childDirectoryNames = collectChildDirectoryNames(dirEntries);
  const childResults = await walkChildDirectories(
    absoluteDirectoryPath,
    pathSegments,
    childDirectoryNames,
    extractMetadata,
  );

  return {
    childResults,
    bareCommandFileNames: collectBareCommandFileNames(dirEntries),
    hasCommandEntry: hasFileNamed(dirEntries, COMMAND_ENTRY_FILE),
    hasGroupMeta: hasFileNamed(dirEntries, GROUP_META_FILE),
  };
}

function collectChildDirectoryNames(dirEntries: readonly Dirent[]): readonly string[] {
  return dirEntries
    .filter((entry) => entry.isDirectory() && !isPrivateRouteEntry(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function walkChildDirectories(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  childDirectoryNames: readonly string[],
  extractMetadata: ExtractMetadataFn,
): Promise<readonly ChildDirectoryWalkResult[]> {
  return Promise.all(
    childDirectoryNames.map(async (directoryName) => {
      const childDirectoryPath = path.join(absoluteDirectoryPath, directoryName);
      const childResult = await walkCommandsDirectory(
        childDirectoryPath,
        [...pathSegments, directoryName],
        extractMetadata,
      );

      return {
        directoryName,
        walkResult: childResult,
      };
    }),
  );
}

function collectBareCommandFileNames(dirEntries: readonly Dirent[]): readonly string[] {
  return dirEntries
    .filter(isBareCommandFileEntry)
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function isBareCommandFileEntry(entry: Dirent): boolean {
  if (!entry.isFile() || !entry.name.endsWith(BARE_COMMAND_EXTENSION)) {
    return false;
  }

  if (
    entry.name === COMMAND_ENTRY_FILE ||
    // _group.ts is a reserved metadata file, so exclude it before applying
    // the generic _-prefixed private route rule below.
    entry.name === GROUP_META_FILE ||
    DECLARATION_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
  ) {
    return false;
  }

  const commandName = commandNameFromFileName(entry.name);

  return !isPrivateRouteEntry(commandName) && !isTestCommandName(commandName);
}

function hasFileNamed(dirEntries: readonly Dirent[], fileName: string): boolean {
  return dirEntries.some((entry) => entry.isFile() && entry.name === fileName);
}

async function buildBareCommandNodes(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  directoryScan: DirectoryScan,
  extractMetadata: ExtractMetadataFn,
): Promise<readonly CommandManifestNode[]> {
  const childDirectoriesWithNodes = new Set(
    directoryScan.childResults
      .filter(({ walkResult }) => walkResult.hasNode)
      .map(({ directoryName }) => directoryName),
  );

  return Promise.all(
    directoryScan.bareCommandFileNames.map(async (fileName) => {
      const commandName = commandNameFromFileName(fileName);

      if (childDirectoriesWithNodes.has(commandName)) {
        throw new Error(
          `Conflicting command definitions: both "${commandName}${BARE_COMMAND_EXTENSION}" and "${commandName}/" exist. A bare command file cannot coexist with a command directory.`,
        );
      }

      const sourceFilePath = path.join(absoluteDirectoryPath, fileName);
      const metadata = await extractMetadata(sourceFilePath);

      return {
        pathSegments: [...pathSegments, commandName],
        kind: "command" as const,
        sourceFilePath,
        childNames: [] as string[],
        aliases: metadata?.aliases ?? [],
        description: metadata?.description,
      };
    }),
  );
}

function aggregateDirectoryScan(directoryScan: DirectoryScan): DirectoryAggregation {
  return {
    ...directoryScan,
    // All nodes collected from recursive walks (includes grandchildren and deeper).
    descendantNodes: directoryScan.childResults.flatMap(({ walkResult }) => walkResult.nodes),
    // Direct child names only (used to populate this node's `childNames`).
    childNames: [
      ...directoryScan.childResults
        .filter(({ walkResult }) => walkResult.hasNode)
        .map(({ directoryName }) => directoryName),
      ...directoryScan.bareCommandFileNames.map(commandNameFromFileName),
    ].sort((left, right) => left.localeCompare(right)),
  };
}

function validateDirectoryAggregation(
  absoluteDirectoryPath: string,
  aggregation: Pick<DirectoryAggregation, "hasCommandEntry" | "hasGroupMeta" | "childNames">,
): void {
  if (aggregation.hasGroupMeta && aggregation.hasCommandEntry) {
    throw new Error(
      `Conflicting definitions: both "${GROUP_META_FILE}" and "${COMMAND_ENTRY_FILE}" exist in the same directory. A directory is either a group (_group.ts) or an executable command (index.ts), not both.`,
    );
  }

  if (aggregation.hasGroupMeta && aggregation.childNames.length === 0) {
    throw new Error(
      `${path.join(absoluteDirectoryPath, GROUP_META_FILE)}: _group.ts exists but the directory has no subcommands.`,
    );
  }
}

function shouldEmitDirectoryNode(
  aggregation: Pick<DirectoryAggregation, "hasCommandEntry" | "hasGroupMeta" | "childNames">,
): boolean {
  return (
    aggregation.hasCommandEntry || aggregation.hasGroupMeta || aggregation.childNames.length > 0
  );
}

async function buildDirectoryNode(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  aggregation: Pick<DirectoryAggregation, "hasCommandEntry" | "hasGroupMeta" | "childNames">,
  extractMetadata: ExtractMetadataFn,
): Promise<CommandManifestNode> {
  if (aggregation.hasCommandEntry) {
    return buildCommandDirectoryNode(
      absoluteDirectoryPath,
      pathSegments,
      aggregation,
      extractMetadata,
    );
  }

  return buildGroupDirectoryNode(absoluteDirectoryPath, pathSegments, aggregation, extractMetadata);
}

async function buildCommandDirectoryNode(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  aggregation: Pick<DirectoryAggregation, "childNames">,
  extractMetadata: ExtractMetadataFn,
): Promise<CommandManifestNode> {
  const sourceFilePath = path.join(absoluteDirectoryPath, COMMAND_ENTRY_FILE);
  const metadata = await extractMetadata(sourceFilePath);
  const aliases = metadata?.aliases ?? [];

  if (aliases.length > 0 && pathSegments.length === 0) {
    throw new Error(
      "Aliases on the root command are not supported. The root command has no parent to resolve aliases against.",
    );
  }

  return {
    pathSegments,
    kind: "command",
    sourceFilePath,
    childNames: aggregation.childNames,
    aliases,
    description: metadata?.description,
  };
}

async function buildGroupDirectoryNode(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  aggregation: Pick<DirectoryAggregation, "hasGroupMeta" | "childNames">,
  extractMetadata: ExtractMetadataFn,
): Promise<CommandManifestNode> {
  const groupMetaPath = path.join(absoluteDirectoryPath, GROUP_META_FILE);

  if (aggregation.hasGroupMeta) {
    await validateGroupMetaFile(groupMetaPath);
  }

  const metadata = aggregation.hasGroupMeta ? await extractMetadata(groupMetaPath) : undefined;

  if (aggregation.hasGroupMeta && !metadata?.description) {
    throw new Error(
      `${groupMetaPath}: _group.ts must export a defineGroup() call with a non-empty "description" string.`,
    );
  }

  const aliases = metadata?.aliases ?? [];

  if (aliases.length > 0 && pathSegments.length === 0) {
    throw new Error(
      "Aliases on the root group are not supported. The root group has no parent to resolve aliases against.",
    );
  }

  return {
    pathSegments,
    kind: "group",
    childNames: aggregation.childNames,
    aliases,
    ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
    ...(metadata?.examples && metadata.examples.length > 0 ? { examples: metadata.examples } : {}),
  };
}

function collectSiblingEntries(
  childResults: readonly ChildDirectoryWalkResult[],
  bareCommandNodes: readonly CommandManifestNode[],
  pathSegments: readonly string[],
): readonly SiblingEntry[] {
  const entries: SiblingEntry[] = [];

  for (const childResult of childResults) {
    if (!childResult.walkResult.hasNode) {
      continue;
    }

    // Find the direct child node (the one whose pathSegments matches this level).
    const childNode = childResult.walkResult.nodes.find(
      (n) =>
        n.pathSegments.length === pathSegments.length + 1 &&
        n.pathSegments[pathSegments.length] === childResult.directoryName,
    );

    entries.push({
      name: childResult.directoryName,
      aliases: childNode?.aliases ?? [],
    });
  }

  for (const bareNode of bareCommandNodes) {
    const name = bareNode.pathSegments[bareNode.pathSegments.length - 1];

    entries.push({
      name,
      aliases: bareNode.aliases,
    });
  }

  return entries;
}

function validateSiblingAliases(siblings: readonly SiblingEntry[]): void {
  // All canonical names and aliases that occupy the same namespace.
  const seen = new Map<string, string>();

  for (const sibling of siblings) {
    const existing = seen.get(sibling.name);

    if (existing !== undefined) {
      throw new Error(`Command name conflict: "${sibling.name}" is already used by "${existing}".`);
    }

    seen.set(sibling.name, sibling.name);

    for (const alias of sibling.aliases) {
      if (alias === sibling.name) {
        throw new Error(
          `Command alias "${alias}" for "${sibling.name}" is the same as its canonical name.`,
        );
      }

      const conflicting = seen.get(alias);

      if (conflicting !== undefined) {
        throw new Error(
          `Command alias conflict: alias "${alias}" for "${sibling.name}" conflicts with "${conflicting}".`,
        );
      }

      seen.set(alias, sibling.name);
    }
  }
}

function isPrivateRouteEntry(name: string): boolean {
  return name.startsWith("_");
}

function commandNameFromFileName(fileName: string): string {
  return fileName.slice(0, -BARE_COMMAND_EXTENSION.length);
}

function isTestCommandName(commandName: string): boolean {
  return TEST_COMMAND_NAME_SUFFIXES.some((suffix) => commandName.endsWith(suffix));
}
