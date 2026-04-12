import path from "node:path";

import type { PackageManager } from "./services/index.ts";

export interface NextStepsInput {
  readonly cwd: string;
  readonly projectRoot: string;
  readonly isCurrentDir: boolean;
  readonly didInstall: boolean;
  readonly pm: PackageManager;
}

export interface NextSteps {
  readonly displayPath: string;
  readonly lines: readonly string[];
}

export function computeNextSteps(input: NextStepsInput): NextSteps {
  const { cwd, projectRoot, isCurrentDir, didInstall, pm } = input;
  const displayPath = isCurrentDir
    ? "."
    : path.relative(cwd, projectRoot) || path.basename(projectRoot);

  const lines: string[] = ["Next steps:"];
  if (!isCurrentDir) {
    lines.push(`  $ cd ${displayPath}`);
  }
  if (!didInstall) {
    lines.push(`  $ ${pm.installCommand}`);
  }
  lines.push(`  $ ${pm.runCommand("start", "hello")}`);

  return { displayPath, lines };
}
