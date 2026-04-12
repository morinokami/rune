import {
  detectPackageManager,
  installDependencies,
  type PackageManager,
} from "./detect-package-manager.ts";
import { checkGitInitAvailability, tryGitInit, type GitInitAvailability } from "./init-git.ts";
import {
  findConflictingEntries,
  scaffoldProject,
  type ScaffoldedProject,
} from "./scaffold-project.ts";

export interface Services {
  readonly detectPackageManager: () => PackageManager;
  readonly findConflictingEntries: (dirPath: string) => Promise<readonly string[]>;
  readonly scaffoldProject: (projectName: string, cwd: string) => Promise<ScaffoldedProject>;
  readonly installDependencies: (pm: PackageManager, projectRoot: string) => Promise<void>;
  readonly checkGitInitAvailability: (projectRoot: string) => GitInitAvailability;
  readonly tryGitInit: (projectRoot: string) => boolean;
}

export const defaultServices: Services = {
  detectPackageManager,
  findConflictingEntries,
  scaffoldProject,
  installDependencies,
  checkGitInitAvailability,
  tryGitInit,
};

export type { PackageManager } from "./detect-package-manager.ts";
export type { GitInitAvailability } from "./init-git.ts";
export type { ScaffoldedProject } from "./scaffold-project.ts";
export { findConflictingEntries, scaffoldProject } from "./scaffold-project.ts";
