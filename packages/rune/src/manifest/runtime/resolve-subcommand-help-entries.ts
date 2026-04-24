import type { SubcommandHelpEntry } from "../../core/help-types";
import type { CommandManifest, CommandManifestNode, CommandManifestPath } from "../manifest-types";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";

export function resolveSubcommandHelpEntries(
  manifest: CommandManifest,
  parentPathSegments: CommandManifestPath,
  childNames: readonly string[],
): readonly SubcommandHelpEntry[] {
  const nodeMap = createCommandManifestNodeMap(manifest);

  return childNames.map((childName) => {
    const childNode: CommandManifestNode | undefined =
      nodeMap[commandManifestPathToKey([...parentPathSegments, childName] as CommandManifestPath)];

    return {
      name: childName,
      aliases: childNode ? [...childNode.aliases] : [],
      description: childNode?.description,
    };
  });
}
