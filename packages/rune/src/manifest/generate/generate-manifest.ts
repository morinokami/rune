import type { CommandManifest } from "../manifest-types";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";
import { extractDescriptionFromSourceFile } from "./extract-description";
import {
  comparePathSegments,
  type ExtractDescriptionFn,
  walkCommandsDirectory,
} from "./walk-commands-directory";

export interface GenerateCommandManifestOptions {
  readonly commandsDirectory: string;
  readonly extractDescription?: ExtractDescriptionFn | undefined;
}

export async function generateCommandManifest(
  options: GenerateCommandManifestOptions,
): Promise<CommandManifest> {
  const extractDescription = options.extractDescription ?? extractDescriptionFromSourceFile;
  const walkResult = await walkCommandsDirectory(options.commandsDirectory, [], extractDescription);

  if (walkResult.nodes.length === 0) {
    throw new Error(
      "No commands found in src/commands/. Create a command file like src/commands/hello.ts or src/commands/hello/index.ts",
    );
  }

  return {
    nodes: [...walkResult.nodes].sort((left, right) =>
      comparePathSegments(left.pathSegments, right.pathSegments),
    ),
  };
}

export function serializeCommandManifest(manifest: CommandManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export { commandManifestPathToKey, createCommandManifestNodeMap };
