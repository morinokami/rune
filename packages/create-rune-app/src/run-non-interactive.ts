import { CommandError } from "@rune-cli/rune";

import type { RunContext } from "./command-context.ts";
import type { Services } from "./services/index.ts";

import { computeNextSteps } from "./next-steps.ts";
import { getProvidedProjectState } from "./plan.ts";

export async function runNonInteractive(ctx: RunContext, services: Services): Promise<void> {
  const { options, args, cwd, output } = ctx;
  const pm = services.detectPackageManager();
  const provided = getProvidedProjectState(cwd, args.projectName);

  if (provided.kind === "none") {
    throw new CommandError({
      kind: "missing-project-name",
      message: "Project name is required",
      hint: "Usage: create-rune-app <project-name> [--yes]",
    });
  }

  if (provided.kind === "existing") {
    throw new CommandError({
      kind: "directory-exists",
      message: `Target directory already exists: ${provided.root}`,
      hint: "Choose a different name or remove the existing directory",
    });
  }

  if (provided.kind === "current-dir") {
    const conflicts = await services.findConflictingEntries(provided.root);

    if (conflicts.length > 0) {
      throw new CommandError({
        kind: "directory-has-conflicts",
        message: `Target directory contains conflicting entries: ${conflicts.join(", ")}`,
        hint: "Remove conflicting files or choose a different directory",
      });
    }
  }

  if (provided.kind === "current-dir") {
    output.log("Scaffolding project in current directory");
  } else {
    output.log(`Scaffolding project: ${provided.name}`);
  }

  let scaffolded;
  try {
    scaffolded = await services.scaffoldProject(provided.name, cwd);
  } catch (error) {
    throw new CommandError({
      kind: "scaffold-failed",
      message: `Failed to scaffold project: ${error instanceof Error ? error.message : "Unknown error"}`,
      hint: "Check the error above and try again in an empty directory.",
    });
  }

  if (options.install) {
    output.log(`Installing dependencies with ${pm.name}...`);
    try {
      await services.installDependencies(pm, scaffolded.projectRoot);
    } catch (error) {
      throw new CommandError({
        kind: "install-failed",
        message: `Failed to install dependencies: ${error instanceof Error ? error.message : "Unknown error"}`,
        hint: "Run the install command manually to see full output",
      });
    }
  }

  if (options.git) {
    const availability = services.checkGitInitAvailability(scaffolded.projectRoot);

    if (availability.ok) {
      output.log("Initializing git repository...");
      const ok = services.tryGitInit(scaffolded.projectRoot);

      if (!ok) {
        throw new CommandError({
          kind: "git-init-failed",
          message: "Failed to initialize git repository",
          hint: "You can initialize git manually with 'git init'",
        });
      }
    } else if (availability.reason === "git-not-installed") {
      output.log("Skipping git initialization (git is not installed)");
    } else {
      output.log("Skipping git initialization (already inside a git repository)");
    }
  }

  const nextSteps = computeNextSteps({
    cwd,
    projectRoot: scaffolded.projectRoot,
    isCurrentDir: provided.kind === "current-dir",
    didInstall: options.install,
    pm,
  });

  output.log("");
  output.log(`Rune project ready at ${nextSteps.displayPath}`);
  for (const line of nextSteps.lines) {
    output.log(line);
  }
}
