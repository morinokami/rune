import type { CommandManifest } from "../manifest-types";

import { extractMetadataFromSourceFile } from "./extract-description";
import {
  comparePathSegments,
  type ExtractMetadataFn,
  walkCommandsDirectory,
} from "./walk-commands-directory";

export interface GenerateCommandManifestOptions {
  readonly commandsDirectory: string;
  readonly extractMetadata?: ExtractMetadataFn | undefined;
}

export async function generateCommandManifest(
  options: GenerateCommandManifestOptions,
): Promise<CommandManifest> {
  const extractMetadata = options.extractMetadata ?? extractMetadataFromSourceFile;
  const walkResult = await walkCommandsDirectory(options.commandsDirectory, [], extractMetadata);

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
