import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

function isGitInstalled(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isInsideGitRepository(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isDefaultBranchSet(): boolean {
  try {
    execSync("git config init.defaultBranch", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function findNearestExistingAncestor(filePath: string): string {
  let current = path.resolve(filePath);

  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }

  return current;
}

export function isGitInitAvailable(projectRoot: string): boolean {
  const ancestor = findNearestExistingAncestor(projectRoot);
  return isGitInstalled() && !isInsideGitRepository(ancestor);
}

export function tryGitInit(projectRoot: string): boolean {
  let didInit = false;

  try {
    execSync("git init", { cwd: projectRoot, stdio: "ignore" });
    didInit = true;

    if (!isDefaultBranchSet()) {
      execSync("git checkout -b main", { cwd: projectRoot, stdio: "ignore" });
    }

    execSync("git add -A", { cwd: projectRoot, stdio: "ignore" });
    execSync('git commit -m "Initial commit from Create Rune App"', {
      cwd: projectRoot,
      stdio: "ignore",
    });

    return true;
  } catch {
    if (didInit) {
      try {
        rmSync(path.join(projectRoot, ".git"), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors.
      }
    }

    return false;
  }
}
