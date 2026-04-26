import type { CommandOptionField } from "../core/field-types";
import type { HelpData } from "../core/help-types";
import type {
  CommandManifest,
  CommandManifestPath,
  LoadCommandFn,
} from "../manifest/manifest-types";
import type { ResolveCommandRouteResult } from "../routing/resolve-command-route";
import type { ResolvedHelpData } from "./resolved-help-data";

import {
  buildCommandHelpData,
  buildGroupHelpData,
  buildUnknownCommandHelpData,
} from "./build-help-data";
import { renderDefaultHelp } from "./render-default-help";
import { resolveSubcommandHelpEntries } from "./resolve-subcommand-help-entries";

export interface RenderResolvedHelpOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand: LoadCommandFn;
  readonly helpRenderer?: ((data: HelpData) => string) | undefined;
  readonly globalOptions?: readonly CommandOptionField[] | undefined;
}

export interface ResolveHelpDataOptions {
  readonly manifest: CommandManifest;
  readonly route: ResolveCommandRouteResult;
  readonly cliName: string;
  readonly version?: string | undefined;
  readonly loadCommand: LoadCommandFn;
  readonly globalOptions?: readonly CommandOptionField[] | undefined;
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

  const node = options.route.node;
  const command = await options.loadCommand(node);

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
    globalOptions: options.globalOptions,
  });

  return { data, aliases: [...node.aliases], commandHelp: command.help };
}

// Resolves a routed help request into the appropriate help text.
export async function renderResolvedHelp(options: RenderResolvedHelpOptions): Promise<string> {
  const resolved = await resolveHelpData(options);

  switch (resolved.data.kind) {
    case "unknown": {
      const render = options.helpRenderer ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
    case "group": {
      const render = options.helpRenderer ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
    case "command": {
      const render = resolved.commandHelp ?? options.helpRenderer ?? renderDefaultHelp;
      return renderHelpSafe(render, resolved.data);
    }
  }
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
