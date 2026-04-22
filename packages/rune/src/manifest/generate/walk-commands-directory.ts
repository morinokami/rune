import { readdir } from "node:fs/promises";
import path from "node:path";

import type { CommandManifestNode, CommandManifestPath } from "../manifest-types";
import type { CommandMetadata } from "./extract-description";

import { validateGroupMetaFile } from "./validate-group-meta";

const COMMAND_ENTRY_FILE = "index.ts";
const GROUP_META_FILE = "_group.ts";
const BARE_COMMAND_EXTENSION = ".ts";
const DECLARATION_FILE_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];
const TEST_COMMAND_NAME_SUFFIXES = [".test", ".spec"];

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

function collectSiblingEntries(
  childResults: readonly { directoryName: string; walkResult: WalkDirectoryResult }[],
  bareCommandNodes: readonly CommandManifestNode[],
  pathSegments: readonly string[],
): readonly { readonly name: string; readonly aliases: readonly string[] }[] {
  const entries: { name: string; aliases: readonly string[] }[] = [];

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

function validateSiblingAliases(
  siblings: readonly { readonly name: string; readonly aliases: readonly string[] }[],
): void {
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

function isTestCommandName(commandName: string): boolean {
  return TEST_COMMAND_NAME_SUFFIXES.some((suffix) => commandName.endsWith(suffix));
}

export async function walkCommandsDirectory(
  absoluteDirectoryPath: string,
  pathSegments: readonly string[],
  extractMetadata: ExtractMetadataFn,
): Promise<WalkDirectoryResult> {
  // ---------------------------------------------------------------------------
  // Scan directory & recurse into subdirectories
  // ---------------------------------------------------------------------------

  const dirEntries = await readdir(absoluteDirectoryPath, { withFileTypes: true });

  const childDirectoryNames = dirEntries
    .filter((entry) => entry.isDirectory() && !isPrivateRouteEntry(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const childResults = await Promise.all(
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

  // ---------------------------------------------------------------------------
  // Collect bare command files (e.g. "status.ts", excluding index.ts / _group.ts)
  // ---------------------------------------------------------------------------

  const bareCommandFileNames = dirEntries
    .filter((entry) => {
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

      const commandName = entry.name.slice(0, -BARE_COMMAND_EXTENSION.length);

      return !isPrivateRouteEntry(commandName) && !isTestCommandName(commandName);
    })
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  // ---------------------------------------------------------------------------
  // Build bare command nodes (with conflict detection against subdirectories)
  // ---------------------------------------------------------------------------

  const childDirectoriesWithNodes = new Set(
    childResults
      .filter(({ walkResult }) => walkResult.hasNode)
      .map(({ directoryName }) => directoryName),
  );

  const bareCommandNodes = await Promise.all(
    bareCommandFileNames.map(async (fileName) => {
      const commandName = fileName.slice(0, -BARE_COMMAND_EXTENSION.length);

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

  // ---------------------------------------------------------------------------
  // Aggregate children & validate directory structure
  // ---------------------------------------------------------------------------

  // All nodes collected from recursive walks (includes grandchildren and deeper).
  const descendantNodes = childResults.flatMap(({ walkResult }) => walkResult.nodes);

  // Direct child names only (used to populate this node's `childNames`).
  const childNames = [
    ...childResults
      .filter(({ walkResult }) => walkResult.hasNode)
      .map(({ directoryName }) => directoryName),
    ...bareCommandFileNames.map((fileName) => fileName.slice(0, -BARE_COMMAND_EXTENSION.length)),
  ].sort((left, right) => left.localeCompare(right));

  const hasCommandEntry = dirEntries.some(
    (entry) => entry.isFile() && entry.name === COMMAND_ENTRY_FILE,
  );
  const hasGroupMeta = dirEntries.some((entry) => entry.isFile() && entry.name === GROUP_META_FILE);

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

  // No index.ts, no _group.ts, no children — this directory is not a node itself.
  if (!hasCommandEntry && !hasGroupMeta && childNames.length === 0) {
    return {
      nodes: [...descendantNodes, ...bareCommandNodes],
      hasNode: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Build this directory's node
  // ---------------------------------------------------------------------------

  let node: CommandManifestNode;

  if (hasCommandEntry) {
    const sourceFilePath = path.join(absoluteDirectoryPath, COMMAND_ENTRY_FILE);
    const metadata = await extractMetadata(sourceFilePath);
    const aliases = metadata?.aliases ?? [];

    if (aliases.length > 0 && pathSegments.length === 0) {
      throw new Error(
        "Aliases on the root command are not supported. The root command has no parent to resolve aliases against.",
      );
    }

    node = {
      pathSegments,
      kind: "command",
      sourceFilePath,
      childNames,
      aliases,
      description: metadata?.description,
    };
  } else {
    const groupMetaPath = path.join(absoluteDirectoryPath, GROUP_META_FILE);

    if (hasGroupMeta) {
      await validateGroupMetaFile(groupMetaPath);
    }

    const metadata = hasGroupMeta ? await extractMetadata(groupMetaPath) : undefined;

    if (hasGroupMeta && !metadata?.description) {
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

    node = {
      pathSegments,
      kind: "group",
      childNames,
      aliases,
      ...(metadata?.description !== undefined ? { description: metadata.description } : {}),
      ...(metadata?.examples && metadata.examples.length > 0
        ? { examples: metadata.examples }
        : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Validate sibling alias collisions
  // ---------------------------------------------------------------------------

  validateSiblingAliases(collectSiblingEntries(childResults, bareCommandNodes, pathSegments));

  return {
    nodes: [node, ...descendantNodes, ...bareCommandNodes],
    hasNode: true,
  };
}
