import type { CommandManifest } from "../manifest-types";
import type { ResolveCommandRouteResult } from "./resolve-command-route";

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
  const command = await loadCommand(options.route.node);
  return renderCommandHelp(command, options.route.matchedPath, options.cliName);
}
