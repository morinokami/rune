import type {
  CommandManifest,
  CommandManifestNodeMap,
  CommandManifestPath,
} from "./manifest-types";

export function commandManifestPathToKey(pathSegments: CommandManifestPath): string {
  return pathSegments.join(" ");
}

export function createCommandManifestNodeMap(manifest: CommandManifest): CommandManifestNodeMap {
  return Object.fromEntries(
    manifest.nodes.map((node) => [commandManifestPathToKey(node.pathSegments), node]),
  );
}
