import type { CommandManifest, CommandManifestPath } from "../manifest-types";
import type { ResolveCommandRouteResult } from "./resolve-command-route";

import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
  type HelpData,
} from "./build-help-data";
import { defaultLoadCommand, type LoadCommandFn } from "./load-command";
import { loadRuneConfigSafe } from "./load-rune-config";
import { renderDefaultHelp } from "./render-default-help";
import { resolveSubcommandHelpEntries } from "./resolve-subcommand-help-entries";

export interface RenderResolvedHelpOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
  readonly configPath?: string | undefined;
}

function renderHelpSafe<T extends HelpData>(render: (data: T) => string, data: T): string {
  try {
    return render(data);
  } catch {
    process.stderr.write(
      "Warning: Custom help renderer threw an error. Using default help renderer.\n",
    );
    return renderDefaultHelp(data);
  }
}

// Resolves a routed help request into the appropriate help text.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  const config = options.configPath ? await loadRuneConfigSafe(options.configPath) : undefined;

  if (options.route.kind === "unknown") {
    const data = buildUnknownCommandHelpData(
      options.route,
      options.cliName,
      options.manifest,
      options.version,
    );
    const render = config?.renderHelp ?? renderDefaultHelp;
    return renderHelpSafe(render, data);
  }

  if (options.route.kind === "group") {
    const data = buildGroupHelpData({
      manifest: options.manifest,
      node: options.route.node,
      cliName: options.cliName,
      version: options.version,
    });
    const render = config?.renderHelp ?? renderDefaultHelp;
    return renderHelpSafe(render, data);
  }

  const loadCommand = options.loadCommand ?? defaultLoadCommand;
  const node = options.route.node;
  const command = await loadCommand(node);

  const subcommands =
    node.childNames.length > 0
      ? resolveSubcommandHelpEntries(
          options.manifest,
          node.pathSegments as CommandManifestPath,
          node.childNames,
        )
      : undefined;

  const data = await buildCommandHelpData({
    command,
    pathSegments: options.route.matchedPath,
    cliName: options.cliName,
    version: options.version,
    subcommands,
  });

  const render = command.help ?? config?.renderHelp ?? renderDefaultHelp;
  return renderHelpSafe(render, data);
}
