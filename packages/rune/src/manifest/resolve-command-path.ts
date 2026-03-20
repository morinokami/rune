import type {
  CommandManifest,
  CommandManifestCommandNode,
  CommandManifestGroupNode,
  CommandManifestNode,
  CommandManifestPath,
} from "./manifest-types";

import { damerauLevenshteinDistance } from "./damerau-levenshtein";
import { commandManifestPathToKey, createCommandManifestNodeMap } from "./manifest-map";

// Shared routing data returned after resolving command path segments.
interface ResolvedCommandPathBase {
  // Command path resolved from manifest nodes before parser/executor handling.
  readonly matchedPath: CommandManifestPath;
  // Tokens left after command path resolution for later help or execution logic.
  readonly remainingArgs: readonly string[];
  // Whether the remaining tokens explicitly request help output.
  readonly helpRequested: boolean;
}

// Successful route result for an executable command.
export interface ResolvedCommandRoute extends ResolvedCommandPathBase {
  readonly kind: "command";
  readonly node: CommandManifestCommandNode;
}

// Successful route result for a help-only command group.
export interface ResolvedCommandGroupRoute extends ResolvedCommandPathBase {
  readonly kind: "group";
  readonly node: CommandManifestGroupNode;
}

// Failed route result when a token does not match a known child command.
export interface UnknownCommandRoute {
  readonly kind: "unknown";
  // Full attempted command path up to and including the unknown segment.
  readonly attemptedPath: CommandManifestPath;
  // Last successfully resolved command/group path before the failure.
  readonly matchedPath: CommandManifestPath;
  // First token that failed to match a child command.
  readonly unknownSegment: string;
  // Available subcommands directly under the matched node.
  readonly availableChildNames: readonly string[];
  // Close child-command matches scoped to the matched node only.
  readonly suggestions: readonly string[];
}

// Any result produced by manifest-only command path resolution.
export type ResolveCommandPathResult =
  | ResolvedCommandRoute
  | ResolvedCommandGroupRoute
  | UnknownCommandRoute;

function isOptionLikeToken(token: string): boolean {
  return token === "--" || token.startsWith("-");
}

function getHelpRequested(args: readonly string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function getSuggestionThreshold(candidate: string): number {
  return Math.max(2, Math.floor(candidate.length / 3));
}

function getSuggestedChildNames(
  unknownSegment: string,
  childNames: readonly string[],
): readonly string[] {
  return [...childNames]
    .map((childName) => ({
      childName,
      distance: damerauLevenshteinDistance(unknownSegment, childName),
    }))
    .filter(({ childName, distance }) => distance <= getSuggestionThreshold(childName))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.childName.localeCompare(right.childName),
    )
    .slice(0, 3)
    .map(({ childName }) => childName);
}

// Resolves CLI argv tokens against the manifest without importing command modules.
export function resolveCommandPath(
  manifest: CommandManifest,
  rawArgs: readonly string[],
): ResolveCommandPathResult {
  const nodeMap = createCommandManifestNodeMap(manifest);
  const rootNode = nodeMap[""];

  if (rootNode === undefined) {
    throw new Error("Manifest root node is missing");
  }

  let currentNode: CommandManifestNode = rootNode;
  let tokenIndex = 0;

  while (tokenIndex < rawArgs.length) {
    const token = rawArgs[tokenIndex];

    if (isOptionLikeToken(token)) {
      break;
    }

    const childPath = [...currentNode.pathSegments, token] as CommandManifestPath;
    const childNode: CommandManifestNode | undefined = nodeMap[commandManifestPathToKey(childPath)];

    if (childNode === undefined) {
      const suggestions = getSuggestedChildNames(token, currentNode.childNames);

      if (currentNode.kind === "group" || suggestions.length > 0) {
        return {
          kind: "unknown",
          attemptedPath: [...currentNode.pathSegments, token],
          matchedPath: currentNode.pathSegments,
          unknownSegment: token,
          availableChildNames: currentNode.childNames,
          suggestions,
        };
      }

      break;
    }

    currentNode = childNode;
    tokenIndex += 1;
  }

  const remainingArgs = rawArgs.slice(tokenIndex);
  const helpRequested = getHelpRequested(remainingArgs);

  if (currentNode.kind === "group") {
    return {
      kind: "group",
      node: currentNode,
      matchedPath: currentNode.pathSegments,
      remainingArgs,
      helpRequested,
    };
  }

  return {
    kind: "command",
    node: currentNode,
    matchedPath: currentNode.pathSegments,
    remainingArgs,
    helpRequested,
  };
}
