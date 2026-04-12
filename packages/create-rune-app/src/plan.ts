import { existsSync } from "node:fs";
import path from "node:path";

export type ProvidedProjectState =
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
    }
  | {
      // "." was provided — scaffold into the current directory.
      readonly kind: "current-dir";
      readonly name: string;
      readonly root: string;
    };

export function getProvidedProjectState(
  cwd: string,
  projectName: string | undefined,
): ProvidedProjectState {
  const name = projectName !== undefined && projectName.trim().length > 0 ? projectName : undefined;

  if (name === undefined) {
    return { kind: "none", name: undefined, root: undefined };
  }

  const root = path.resolve(cwd, name);

  if (name === "." || name === "./") {
    return { kind: "current-dir", name, root };
  }

  if (existsSync(root)) {
    return { kind: "existing", name, root };
  }

  return { kind: "available", name, root };
}

export function wasExplicitlyPassed(rawArgs: readonly string[], name: string): boolean {
  return rawArgs.some((arg) => arg === `--${name}` || arg === `--no-${name}`);
}
