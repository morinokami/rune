import { cancel, confirm, group, intro, isCancel, log, outro, tasks, text } from "@clack/prompts";
import { CommandError, defineCommand } from "@rune-cli/rune";
import { existsSync } from "node:fs";
import path from "node:path";
import { styleText } from "node:util";

import { detectPackageManager, installDependencies } from "../detect-package-manager.ts";
import { checkGitInitAvailability, tryGitInit } from "../init-git.ts";
import { scaffoldProject } from "../scaffold-project.ts";

const INTRO_TITLE = styleText(["bgCyan", "black", "bold"], "Create Rune App");

type ProvidedProjectState =
  | {
      // Project name was not provided.
      readonly kind: "none";
      readonly name: undefined;
      readonly root: undefined;
    }
  | {
      // Project name was provided, but the directory already exists.
      readonly kind: "existing";
      readonly name: string;
      readonly root: string;
    }
  | {
      // Project name was provided, and the directory is available.
      readonly kind: "available";
      readonly name: string;
      readonly root: string;
    };

function getProvidedProjectState(
  cwd: string,
  projectName: string | undefined,
): ProvidedProjectState {
  const name = projectName !== undefined && projectName.trim().length > 0 ? projectName : undefined;

  if (name === undefined) {
    return { kind: "none", name: undefined, root: undefined };
  }

  const root = path.resolve(cwd, name);

  if (existsSync(root)) {
    return { kind: "existing", name, root };
  }

  return { kind: "available", name, root };
}

function wasExplicitlyPassed(rawArgs: readonly string[], name: string): boolean {
  return rawArgs.some((arg) => arg === `--${name}` || arg === `--no-${name}`);
}

// Root command for scaffolding a new Rune CLI project.
const command = defineCommand({
  description: "Create a new Rune CLI project",
  args: [
    {
      name: "projectName",
      type: "string",
      description: "Directory name for the new project",
    },
  ],
  options: [
    {
      name: "yes",
      type: "boolean",
      short: "y",
      description: "Skip all interactive prompts and use defaults",
    },
    {
      name: "install",
      type: "boolean",
      default: true,
      description: "Install dependencies after scaffolding",
    },
    {
      name: "git",
      type: "boolean",
      default: true,
      description: "Initialize a git repository",
    },
  ],
  async run(ctx) {
    const nonInteractive = ctx.options.yes || !process.stdin.isTTY;

    if (nonInteractive) {
      await runNonInteractive(ctx);
    } else {
      await runInteractive(ctx);
    }
  },
});

export default command;

type Ctx = Parameters<typeof command.run>[0];

async function runNonInteractive({ args, cwd, options, output }: Ctx): Promise<void> {
  const pm = detectPackageManager();
  const provided = getProvidedProjectState(cwd, args.projectName);

  if (provided.kind === "none") {
    throw new CommandError({
      kind: "missing-project-name",
      message: "Project name is required in non-interactive mode",
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

  output.log(`Scaffolding project: ${provided.name}`);
  const scaffolded = await scaffoldProject(provided.name, cwd);

  if (options.install) {
    output.log(`Installing dependencies with ${pm.name}...`);
    try {
      await installDependencies(pm, scaffolded.projectRoot);
    } catch (error) {
      throw new CommandError({
        kind: "install-failed",
        message: error instanceof Error ? error.message : "Dependency installation failed",
        hint: "Run the install command manually to see full output",
      });
    }
  }

  if (options.git) {
    const availability = checkGitInitAvailability(scaffolded.projectRoot);

    if (availability.ok) {
      output.log("Initializing git repository...");
      const ok = tryGitInit(scaffolded.projectRoot);

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

  const displayProjectPath =
    path.relative(cwd, scaffolded.projectRoot) || path.basename(scaffolded.projectRoot);

  output.log(`Done. Project created at ${displayProjectPath}`);
  output.log("Next steps:");
  output.log(`  $ cd ${displayProjectPath}`);
  if (!options.install) {
    output.log(`  $ ${pm.installCommand}`);
  }
  output.log(`  $ ${pm.runCommand("start", "hello")}`);
}

async function runInteractive({ args, cwd, options, output, rawArgs }: Ctx): Promise<void> {
  intro(INTRO_TITLE);
  const pm = detectPackageManager();
  const provided = getProvidedProjectState(cwd, args.projectName);

  if (provided.kind === "existing") {
    log.warn(`Target directory already exists: ${provided.root}`);
  }
  if (provided.kind === "available") {
    log.step(`Project name: ${provided.name}`);
  }

  const installExplicit = wasExplicitlyPassed(rawArgs, "install");
  const gitExplicit = wasExplicitlyPassed(rawArgs, "git");

  const cancelProjectCreation = (): never => {
    cancel("Project creation canceled");
    // Use CommandError with an empty message so Rune exits non-zero
    // without writing anything extra to stderr (renderHumanError
    // returns "" and the guard in run-manifest-command skips output).
    throw new CommandError({ kind: "canceled", message: "" });
  };

  const promptAnswers = await group<{
    projectName: string;
    shouldInstallDependencies: boolean;
    shouldInitGit: boolean;
  }>({
    projectName: async (): Promise<string> => {
      if (provided.kind === "available") {
        return provided.name;
      }

      const promptResult = await text({
        message: "What is your project name?",
        placeholder: "my-rune-app",
        validate(value) {
          if (value === undefined || value.trim().length === 0) {
            return "Project name is required";
          }

          const projectRoot = path.resolve(cwd, value);

          if (existsSync(projectRoot)) {
            return `Target directory already exists: ${projectRoot}`;
          }

          return undefined;
        },
      });

      return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
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
      const availability = checkGitInitAvailability(resolvedRoot);

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

  const projectRoot = path.resolve(cwd, promptAnswers.projectName);

  const projectName = promptAnswers.projectName;
  const displayProjectPath = path.relative(cwd, projectRoot) || path.basename(projectRoot);
  const shouldInstallDependencies = promptAnswers.shouldInstallDependencies;
  const shouldInitGit = promptAnswers.shouldInitGit;
  let scaffoldedProject: Awaited<ReturnType<typeof scaffoldProject>> | undefined;

  await tasks([
    {
      title: "Setting up your project",
      task: async () => {
        scaffoldedProject = await scaffoldProject(projectName, cwd);
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

        await installDependencies(pm, scaffoldedProject.projectRoot);
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

        const ok = tryGitInit(scaffoldedProject.projectRoot);
        return ok ? "Initialized git repository" : "Git initialization skipped";
      },
    },
  ]);

  outro(`Rune project is ready at ${displayProjectPath}`);
  output.log("Next steps:");
  output.log(`  $ cd ${displayProjectPath}`);
  if (!shouldInstallDependencies) {
    output.log(`  $ ${pm.installCommand}`);
  }
  output.log(`  $ ${pm.runCommand("start", "hello")}`);
}
