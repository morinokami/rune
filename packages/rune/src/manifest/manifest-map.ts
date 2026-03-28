import type {
  CommandManifest,
  CommandManifestNodeMap,
  CommandManifestPath,
} from "./manifest-types";

export function commandManifestPathToKey(pathSegments: CommandManifestPath): string {
  return pathSegments.join(" ");
}

export function createCommandManifestNodeMap(manifest: CommandManifest): CommandManifestNodeMap {
  const entries: [string, (typeof manifest.nodes)[number]][] = [];

  for (const node of manifest.nodes) {
    // Register the canonical path key.
    entries.push([commandManifestPathToKey(node.pathSegments), node]);

    // Register alias keys: replace this node's own segment with each alias,
    // keeping ancestor segments as canonical.
    if (node.aliases.length > 0 && node.pathSegments.length > 0) {
      const parentSegments = node.pathSegments.slice(0, -1);

      for (const alias of node.aliases) {
        entries.push([commandManifestPathToKey([...parentSegments, alias]), node]);
      }
    }
  }

  return Object.fromEntries(entries);
}
