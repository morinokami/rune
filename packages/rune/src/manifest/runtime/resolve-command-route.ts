import type {
  CommandManifest,
  CommandManifestCommandNode,
  CommandManifestGroupNode,
  CommandManifestNode,
  CommandManifestPath,
} from "../manifest-types";

import { isHelpFlag } from "../../cli/flags";
import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";
import { damerauLevenshteinDistance } from "./damerau-levenshtein";

// Shared routing data returned after resolving command route segments.
interface ResolvedCommandRouteBase {
  // Command path resolved from manifest nodes before parser/executor handling.
  readonly matchedPath: CommandManifestPath;
  // Tokens left after command path resolution for later help or execution logic.
  readonly remainingArgs: readonly string[];
  // Whether the remaining tokens explicitly request help output.
  readonly helpRequested: boolean;
}

// Successful route result for an executable command.
export interface ResolvedCommandRoute extends ResolvedCommandRouteBase {
  readonly kind: "command";
  readonly node: CommandManifestCommandNode;
}

// Successful route result for a help-only command group.
export interface ResolvedCommandGroupRoute extends ResolvedCommandRouteBase {
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

// Any result produced by manifest-only command route resolution.
export type ResolveCommandRouteResult =
  | ResolvedCommandRoute
  | ResolvedCommandGroupRoute
  | UnknownCommandRoute;

function isOptionLikeToken(token: string): boolean {
  return token === "--" || token.startsWith("-");
}

function getHelpRequested(args: readonly string[]): boolean {
  return args.some(isHelpFlag);
}

function getSuggestionThreshold(candidate: string): number {
  return Math.max(2, Math.floor(candidate.length / 3));
}

interface SiblingCandidate {
  readonly canonicalName: string;
  readonly matchName: string;
}

function getSuggestedChildNames(
  unknownSegment: string,
  candidates: readonly SiblingCandidate[],
): readonly string[] {
  const scored = candidates
    .map((candidate) => ({
      canonicalName: candidate.canonicalName,
      distance: damerauLevenshteinDistance(unknownSegment, candidate.matchName),
      threshold: getSuggestionThreshold(candidate.matchName),
    }))
    .filter(({ distance, threshold }) => distance <= threshold);

  // Deduplicate by canonical name, keeping the best (lowest) distance.
  const bestByCanonical = new Map<string, number>();

  for (const entry of scored) {
    const existing = bestByCanonical.get(entry.canonicalName);

    if (existing === undefined || entry.distance < existing) {
      bestByCanonical.set(entry.canonicalName, entry.distance);
    }
  }

  return [...bestByCanonical.entries()]
    .sort(([nameA, distA], [nameB, distB]) => distA - distB || nameA.localeCompare(nameB))
    .slice(0, 3)
    .map(([name]) => name);
}

function collectSiblingCandidates(
  currentNode: CommandManifestNode,
  nodeMap: Readonly<Record<string, CommandManifestNode>>,
): readonly SiblingCandidate[] {
  const candidates: SiblingCandidate[] = [];

  for (const childName of currentNode.childNames) {
    candidates.push({ canonicalName: childName, matchName: childName });

    const childKey = commandManifestPathToKey([...currentNode.pathSegments, childName]);
    const childNode = nodeMap[childKey];

    if (childNode) {
      for (const alias of childNode.aliases) {
        candidates.push({ canonicalName: childName, matchName: alias });
      }
    }
  }

  return candidates;
}

// Resolves CLI argv tokens against the manifest without importing command modules.
export function resolveCommandRoute(
  manifest: CommandManifest,
  rawArgs: readonly string[],
): ResolveCommandRouteResult {
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
      const candidates = collectSiblingCandidates(currentNode, nodeMap);
      const suggestions = getSuggestedChildNames(token, candidates);

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
