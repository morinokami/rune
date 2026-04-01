import { cancel, confirm, group, intro, isCancel, log, outro, tasks, text } from "@clack/prompts";
import { defineCommand } from "@rune-cli/rune";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { styleText } from "node:util";

import { detectPackageManager } from "../detect-package-manager.ts";
import { isGitInitAvailable, tryGitInit } from "../init-git.ts";
import { scaffoldProject } from "../scaffold-project.ts";

const INTRO_TITLE = styleText(["bgCyan", "black", "bold"], "Create Rune App");

type ProvidedProjectState =
  | {
      readonly kind: "none";
      readonly name: undefined;
      readonly root: undefined;
    }
  | {
      readonly kind: "existing";
      readonly name: string;
      readonly root: string;
    }
  | {
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

// Root command for scaffolding a new Rune CLI project.
export default defineCommand({
  description: "Create a new Rune CLI project",
  args: [
    {
      name: "projectName",
      type: "string",
      description: "Directory name for the new project",
    },
  ],
  async run(ctx) {
    intro(INTRO_TITLE);
    const pm = detectPackageManager();
    const provided = getProvidedProjectState(ctx.cwd, ctx.args.projectName);

    if (provided.kind === "existing") {
      log.warn(`Target directory already exists: ${provided.root}`);
    }
    if (provided.kind === "available") {
      log.step(`Project name: ${provided.name}`);
    }

    const cancelProjectCreation = (): never => {
      cancel("Project creation canceled");
      // Throw an empty error so Rune exits non-zero without duplicating output on stderr.
      throw new Error();
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

            const projectRoot = path.resolve(ctx.cwd, value);

            if (existsSync(projectRoot)) {
              return `Target directory already exists: ${projectRoot}`;
            }

            return undefined;
          },
        });

        return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
      },
      shouldInstallDependencies: async (): Promise<boolean> => {
        const promptResult = await confirm({
          message: `Install dependencies with ${pm.name}?`,
          initialValue: true,
        });

        return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
      },
      shouldInitGit: async ({ results }): Promise<boolean> => {
        const resolvedRoot = path.resolve(ctx.cwd, results.projectName as string);
        if (!isGitInitAvailable(resolvedRoot)) {
          return false;
        }

        const promptResult = await confirm({
          message: "Initialize a git repository?",
          initialValue: true,
        });

        return !isCancel(promptResult) ? promptResult : cancelProjectCreation();
      },
    });

    const projectRoot = path.resolve(ctx.cwd, promptAnswers.projectName);

    const projectName = promptAnswers.projectName;
    const displayProjectPath = path.relative(ctx.cwd, projectRoot) || path.basename(projectRoot);
    const shouldInstallDependencies = promptAnswers.shouldInstallDependencies;
    const shouldInitGit = promptAnswers.shouldInitGit;
    let scaffoldedProject: Awaited<ReturnType<typeof scaffoldProject>> | undefined;

    await tasks([
      {
        title: "Setting up your project",
        task: async () => {
          scaffoldedProject = await scaffoldProject(projectName, ctx.cwd);
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

          const currentProject = scaffoldedProject;

          await new Promise<void>((resolve, reject) => {
            const stdoutChunks: Uint8Array[] = [];
            const stderrChunks: Uint8Array[] = [];
            const childProcess = spawn(pm.name, pm.installArgs, {
              cwd: currentProject.projectRoot,
              stdio: ["ignore", "pipe", "pipe"],
            });

            childProcess.stdout?.on("data", (chunk: Uint8Array) => {
              stdoutChunks.push(chunk);
            });
            childProcess.stderr?.on("data", (chunk: Uint8Array) => {
              stderrChunks.push(chunk);
            });
            childProcess.once("error", reject);
            childProcess.once("close", (code, signal) => {
              if (code === 0) {
                resolve();
                return;
              }

              const capturedOutput = Buffer.concat([...stderrChunks, ...stdoutChunks])
                .toString("utf8")
                .trim();

              if (signal !== null) {
                reject(
                  new Error(
                    capturedOutput ||
                      `Dependency installation with ${pm.name} was interrupted by signal ${signal}.`,
                  ),
                );
                return;
              }

              reject(
                new Error(
                  capturedOutput ||
                    `Dependency installation with ${pm.name} failed with exit code ${code ?? "unknown"}.`,
                ),
              );
            });
          });

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
    ctx.output.info("Next steps:");
    ctx.output.info(`  $ cd ${displayProjectPath}`);
    if (!shouldInstallDependencies) {
      ctx.output.info(`  $ ${pm.installCommand}`);
    }
    ctx.output.info(`  $ ${pm.runCommand("start", "hello")}`);
  },
});
