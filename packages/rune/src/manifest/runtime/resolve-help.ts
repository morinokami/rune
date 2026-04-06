import type { CommandManifest, CommandManifestPath } from "../manifest-types";
import type { ResolveCommandRouteResult } from "./resolve-command-route";

import { commandManifestPathToKey, createCommandManifestNodeMap } from "../manifest-map";
import { defaultLoadCommand, type LoadCommandFn } from "./command-loader";
import { renderCommandHelp, renderGroupHelp, renderUnknownCommandMessage } from "./render-help";

export interface RenderResolvedHelpOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

// Resolves a routed help request into the appropriate help text.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  if (options.route.kind === "unknown") {
    return renderUnknownCommandMessage(options.route, options.cliName);
  }

  if (options.route.kind === "group") {
    return renderGroupHelp({
      manifest: options.manifest,
      node: options.route.node,
      cliName: options.cliName,
      version: options.version,
    });
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const node = options.route.node;
  const command = await loadCommand(node);

  if (node.childNames.length === 0) {
    return renderCommandHelp(command, options.route.matchedPath, options.cliName);
  }

  const nodeMap = createCommandManifestNodeMap(options.manifest);
  const subcommands = node.childNames.map((childName) => {
    const childNode =
      nodeMap[commandManifestPathToKey([...node.pathSegments, childName] as CommandManifestPath)];
    const aliasSuffix =
      childNode && childNode.aliases.length > 0 ? ` (${childNode.aliases.join(", ")})` : "";

    return {
      label: `${childName}${aliasSuffix}`,
      description: childNode?.description,
    };
  });

  return renderCommandHelp({
    command,
    pathSegments: options.route.matchedPath,
    cliName: options.cliName,
    subcommands,
  });
}
