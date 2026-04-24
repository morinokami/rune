import type { CommandHelpData } from "../core/help-types";
import type { CommandManifest, CommandManifestPath } from "../manifest/manifest-types";
import type { ResolveCommandRouteResult } from "../routing/resolve-command-route";

import { defaultLoadCommand, type LoadCommandFn } from "../runtime/load-command";
import { loadRuneConfigSafe } from "../runtime/load-rune-config";
import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
  type HelpData,
} from "./build-help-data";
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

export interface ResolveHelpDataOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand?: LoadCommandFn | undefined;
}

export interface ResolvedHelpData {
  readonly data: HelpData;
  readonly aliases: readonly string[];
  /**
   * Text-only command help renderer from defineCommand({ help }).
   * JSON help intentionally ignores custom renderers and serializes `data`
   * through Rune's stable help JSON contract instead.
   */
  readonly commandHelp?: ((data: CommandHelpData) => string) | undefined;
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

export async function resolveHelpData(options: ResolveHelpDataOptions): Promise<ResolvedHelpData> {
  if (options.route.kind === "unknown") {
    const data = buildUnknownCommandHelpData(
      options.route,
      options.cliName,
      options.manifest,
      options.version,
    );
    return { data, aliases: [] };
  }

  if (options.route.kind === "group") {
    const data = buildGroupHelpData({
      manifest: options.manifest,
      node: options.route.node,
      cliName: options.cliName,
      version: options.version,
    });
    return { data, aliases: [...options.route.node.aliases] };
  }

  const loadCommandFn = options.loadCommand ?? defaultLoadCommand;
  const node = options.route.node;
  const command = await loadCommandFn(node);

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

  return { data, aliases: [...node.aliases], commandHelp: command.help };
}

// Resolves a routed help request into the appropriate help text.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  const config = options.configPath ? await loadRuneConfigSafe(options.configPath) : undefined;
  const resolved = await resolveHelpData(options);

  switch (resolved.data.kind) {
    case "unknown": {
      const render = config?.help ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
    case "group": {
      const render = config?.help ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
    case "command": {
      const render = resolved.commandHelp ?? config?.help ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
  }
}
