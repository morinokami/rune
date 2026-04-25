import { cancel, confirm, group, intro, isCancel, log, outro, tasks, text } from "@clack/prompts";
import { CommandError } from "@rune-cli/rune";
import { existsSync } from "node:fs";
import path from "node:path";
import { styleText } from "node:util";

import type { InteractiveRunContext } from "./command-context.ts";
import type { ScaffoldedProject, Services } from "./services/index.ts";

import { computeNextSteps } from "./next-steps.ts";
import { getProvidedProjectState, wasExplicitlyPassed } from "./plan.ts";

const INTRO_TITLE = styleText(["bgCyan", "black", "bold"], "Create Rune App");
const DEFAULT_PROJECT_NAME = "my-rune-app";

function cancelProjectCreation(): never {
  cancel("Project creation canceled");
  // Use CommandError with an empty message so Rune exits non-zero
  // without writing anything extra to stderr (renderHumanError
  // returns "" and the guard in run-manifest-command skips output).
  throw new CommandError({ kind: "canceled", message: "" });
}

export async function runInteractive(
  ctx: InteractiveRunContext,
  services: Services,
): Promise<void> {
  const { args, cwd, options, output, rawArgs } = ctx;
  intro(INTRO_TITLE);
  const pm = services.detectPackageManager();
  const provided = getProvidedProjectState(cwd, args.projectName);

  if (provided.kind === "existing") {
    log.warn(`Target directory already exists: ${provided.root}`);
  }
  if (provided.kind === "current-dir") {
    const conflicts = await services.findConflictingEntries(provided.root);

    if (conflicts.length > 0) {
      cancel(`Target directory contains conflicting files: ${conflicts.join(", ")}`);
      throw new CommandError({ kind: "canceled", message: "" });
    }

    log.step("Scaffolding in current directory");
  }
  if (provided.kind === "available") {
    log.step(`Project name: ${provided.name}`);
  }

  const installExplicit = wasExplicitlyPassed(rawArgs, "install");
  const gitExplicit = wasExplicitlyPassed(rawArgs, "git");

  const promptAnswers = await group<{
    projectName: string;
    shouldInstallDependencies: boolean;
    shouldInitGit: boolean;
  }>({
    projectName: async (): Promise<string> => {
      if (provided.kind === "available" || provided.kind === "current-dir") {
        return provided.name;
      }

      const promptResult = await text({
        message: "What is your project name?",
        placeholder: DEFAULT_PROJECT_NAME,
        defaultValue: DEFAULT_PROJECT_NAME,
        validate(value) {
          const projectName =
            value === undefined || value.trim().length === 0 ? DEFAULT_PROJECT_NAME : value;

          // "." / "./" scaffolds into cwd; conflict check runs post-prompt.
          if (projectName === "." || projectName === "./") {
            return undefined;
          }

          const projectRoot = path.resolve(cwd, projectName);

          if (existsSync(projectRoot)) {
            return `Target directory already exists: ${projectRoot}`;
          }

          return undefined;
        },
      });

      if (isCancel(promptResult)) {
        return cancelProjectCreation();
      }

      if (promptResult === "." || promptResult === "./") {
        const conflicts = await services.findConflictingEntries(path.resolve(cwd, promptResult));

        if (conflicts.length > 0) {
          cancel(`Target directory contains conflicting files: ${conflicts.join(", ")}`);
          throw new CommandError({ kind: "canceled", message: "" });
        }
      }

      return promptResult;
    },
    shouldInstallDependencies: async (): Promise<boolean> => {
      if (installExplicit) {
        return options.install;
      }

      const promptResult = await confirm({
        message: `Install dependencies with ${pm.name}?`,
        initialValue: true,
      });

      return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
    },
    shouldInitGit: async ({ results }): Promise<boolean> => {
      // --no-git: user explicitly opted out, skip everything.
      if (gitExplicit && !options.git) {
        return false;
      }

      const resolvedRoot = path.resolve(cwd, results.projectName as string);
      const availability = services.checkGitInitAvailability(resolvedRoot);

      if (!availability.ok) {
        if (availability.reason === "git-not-installed") {
          log.info("Skipping git initialization (git is not installed)");
        } else {
          log.info("Skipping git initialization (already inside a git repository)");
        }
        return false;
      }

      // --git: user explicitly opted in and git is available, skip prompt.
      if (gitExplicit) {
        return true;
      }

      const promptResult = await confirm({
        message: "Initialize a git repository?",
        initialValue: true,
      });

      return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
    },
  });

  const projectName = promptAnswers.projectName;
  const projectRoot = path.resolve(cwd, projectName);
  const isCurrentDir = projectName === "." || projectName === "./";
  const shouldInstallDependencies = promptAnswers.shouldInstallDependencies;
  const shouldInitGit = promptAnswers.shouldInitGit;
  let scaffoldedProject: ScaffoldedProject | undefined;

  await tasks([
    {
      title: "Setting up your project",
      task: async () => {
        scaffoldedProject = await services.scaffoldProject(projectName, cwd);
        return "Set up your project";
      },
    },
    {
      title: `Installing dependencies with ${pm.name}`,
      enabled: shouldInstallDependencies,
      task: async () => {
        if (scaffoldedProject === undefined) {
          throw new Error("Project scaffolding did not complete.");
        }

        await services.installDependencies(pm, scaffoldedProject.projectRoot);
        return "Installed dependencies";
      },
    },
    {
      title: "Initializing git repository",
      enabled: shouldInitGit,
      task: async () => {
        if (scaffoldedProject === undefined) {
          throw new Error("Project scaffolding did not complete.");
        }

        const ok = services.tryGitInit(scaffoldedProject.projectRoot);
        return ok ? "Initialized git repository" : "Git initialization skipped";
      },
    },
  ]);

  const nextSteps = computeNextSteps({
    cwd,
    projectRoot,
    isCurrentDir,
    didInstall: shouldInstallDependencies,
    pm,
  });

  outro(`Rune project is ready at ${nextSteps.displayPath}`);
  for (const line of nextSteps.lines) {
    output.log(line);
  }
}
