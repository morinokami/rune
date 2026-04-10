import type { CommandManifest, CommandManifestPath } from "../manifest-types";
import type { ResolveCommandRouteResult } from "./resolve-command-route";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";
import { defaultLoadCommand, type LoadCommandFn } from "./command-loader";
import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
  type SubcommandHelpEntry,
} from "./help-data";
import { renderDefaultHelp } from "./render-help";

export interface RenderResolvedHelpOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

function resolveChildSubcommands(
  manifest: CommandManifest,
  parentPathSegments: CommandManifestPath,
  childNames: readonly string[],
): readonly SubcommandHelpEntry[] {
  const nodeMap = createCommandManifestNodeMap(manifest);

  return childNames.map((childName) => {
    const childNode =
      nodeMap[commandManifestPathToKey([...parentPathSegments, childName] as CommandManifestPath)];

    return {
      name: childName,
      aliases: childNode ? [...childNode.aliases] : [],
      description: childNode?.description,
    };
  });
}

// Resolves a routed help request into the appropriate help text.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  if (options.route.kind === "unknown") {
    const data = buildUnknownCommandHelpData(options.route, options.cliName, options.version);
    return renderDefaultHelp(data);
  }

  if (options.route.kind === "group") {
    const data = buildGroupHelpData({
      manifest: options.manifest,
      node: options.route.node,
      cliName: options.cliName,
      version: options.version,
    });
    return renderDefaultHelp(data);
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const node = options.route.node;
  const command = await loadCommand(node);

  const subcommands =
    node.childNames.length > 0
      ? resolveChildSubcommands(options.manifest, node.pathSegments, node.childNames)
      : undefined;

  const data = await buildCommandHelpData({
    command,
    pathSegments: options.route.matchedPath,
    cliName: options.cliName,
    version: options.version,
    subcommands,
  });

  return renderDefaultHelp(data);
}
