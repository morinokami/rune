import type { EarlyExit } from "./rune-options";

import runePackageJson from "../../package.json" with { type: "json" };
import { buildUnknownCommandHelpData } from "../help/build-help-data";
import { renderDefaultHelp } from "../help/render-default-help";
import { renderResolvedHelp } from "../help/render-resolved-help";
import { isVersionFlag } from "../routing/framework-flags";
import { resolveCommandRoute } from "../routing/resolve-command-route";
import { createRuneCliManifest, getRuneSubcommand, loadRuneCommand } from "./rune-subcommands";
import { writeStderrLine, writeStdout } from "./write-result";

export interface RunRuneCliOptions {
  readonly argv: readonly string[];
  readonly cwd?: string | undefined;
}

// Parses Rune's own CLI arguments and dispatches to subcommands such as `rune run`.
export async function runRuneCli(options: RunRuneCliOptions): Promise<number> {
  const manifest = createRuneCliManifest();
  const route = resolveCommandRoute(manifest, options.argv);

  if (route.kind === "unknown") {
    const helpData = buildUnknownCommandHelpData(route, "rune", manifest, getRuneVersion());
    await writeStderrLine(renderDefaultHelp(helpData));
    return 1;
  }

  if (route.kind === "group") {
    if (route.remainingArgs.length === 1 && isVersionFlag(route.remainingArgs[0])) {
      await writeStdout(`rune v${getRuneVersion()}\n`);
      return 0;
    }

    const help = await renderResolvedHelp({
      manifest,
      route,
      cliName: "rune",
      version: getRuneVersion(),
      loadCommand: loadRuneCommand,
    });
    await writeStdout(help);
    return 0;
  }

  const commandName = route.node.pathSegments.at(-1);
  const subcommand = getRuneSubcommand(commandName);

  if (subcommand) {
    if (subcommand.isHelpRequested(route.remainingArgs)) {
      const help = await renderResolvedHelp({
        manifest,
        route,
        cliName: "rune",
        loadCommand: loadRuneCommand,
      });
      await writeStdout(help);
      return 0;
    }

    const invocation = subcommand.resolveInvocation(route.remainingArgs);

    if (!invocation.ok) {
      return writeEarlyExit(invocation);
    }

    return invocation.run({ cwd: options.cwd });
  }

  return 1;
}

async function writeEarlyExit(exit: EarlyExit): Promise<number> {
  if (exit.stream === "stdout") {
    await writeStdout(exit.output);
  } else {
    await writeStderrLine(exit.output);
  }

  return exit.exitCode;
}

function getRuneVersion(): string {
  return runePackageJson.version;
}
