import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { PackageManager, Services } from "../src/services/index.ts";

import { findConflictingEntries } from "../src/services/index.ts";

const tempDirs = new Set<string>();

export async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "crune-cmd-"));
  tempDirs.add(dir);
  return dir;
}

export async function cleanupTempDirs(): Promise<void> {
  await Promise.all([...tempDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
}

export const fakePm: PackageManager = {
  name: "npm",
  installArgs: ["install"],
  installCommand: "npm install",
  runCommand: (script, args) => `npm run ${script} -- ${args}`,
};

export interface FakeServicesResult {
  readonly services: Services;
  readonly calls: {
    scaffold: { name: string; cwd: string }[];
    install: { root: string }[];
    gitInit: { root: string }[];
    gitCheck: { root: string }[];
  };
}

export function makeFakeServices(overrides: Partial<Services> = {}): FakeServicesResult {
  const calls: FakeServicesResult["calls"] = {
    scaffold: [],
    install: [],
    gitInit: [],
    gitCheck: [],
  };

  const services: Services = {
    detectPackageManager: overrides.detectPackageManager ?? (() => fakePm),
    findConflictingEntries: overrides.findConflictingEntries ?? findConflictingEntries,
    scaffoldProject:
      overrides.scaffoldProject ??
      (async (name, cwd) => {
        calls.scaffold.push({ name, cwd });
        const projectRoot = name === "." || name === "./" ? cwd : path.join(cwd, name);
        return {
          projectRoot,
          packageName: name === "." ? path.basename(cwd) : name,
          cliName: name === "." ? path.basename(cwd) : name,
        };
      }),
    installDependencies:
      overrides.installDependencies ??
      (async (_pm, root) => {
        calls.install.push({ root });
      }),
    checkGitInitAvailability:
      overrides.checkGitInitAvailability ??
      ((root) => {
        calls.gitCheck.push({ root });
        return { ok: true };
      }),
    tryGitInit:
      overrides.tryGitInit ??
      ((root) => {
        calls.gitInit.push({ root });
        return true;
      }),
  };

  return { services, calls };
}

export function createOutputSpy(): {
  readonly output: {
    readonly log: (...args: unknown[]) => void;
    readonly error: (...args: unknown[]) => void;
  };
  readonly lines: string[];
} {
  const lines: string[] = [];

  return {
    output: {
      log: (...args) => {
        lines.push(args.map((arg) => String(arg)).join(" "));
      },
      error: (...args) => {
        lines.push(args.map((arg) => String(arg)).join(" "));
      },
    },
    lines,
  };
}
