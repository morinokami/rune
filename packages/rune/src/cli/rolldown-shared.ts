import type { BundleError, InputOptions } from "rolldown";

import { stat } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const BUILD_TARGET = "node24";

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export function stripFileExtension(filePath: string): string {
  const parsedPath = path.parse(filePath);
  return path.join(parsedPath.dir, parsedPath.name);
}

// ---------------------------------------------------------------------------
// Rolldown configuration
// ---------------------------------------------------------------------------

export async function resolveBuildTsconfig(projectRoot: string): Promise<false | string> {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");

  return (await pathExists(tsconfigPath)) ? tsconfigPath : false;
}

export function createSharedBuildConfig(
  cwd: string,
  tsconfig: false | string,
): Pick<InputOptions, "cwd" | "platform" | "tsconfig" | "transform" | "logLevel"> {
  return {
    cwd,
    platform: "node",
    tsconfig,
    transform: {
      target: BUILD_TARGET,
    },
    logLevel: "silent",
  };
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

export function isBuildFailure(error: unknown): error is BundleError {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}

export function formatBuildFailure(projectRoot: string, error: BundleError): string {
  const [firstError] = error.errors ?? [];

  if (!firstError) {
    return "Failed to build project";
  }

  if (!firstError.loc?.file) {
    return `Failed to compile: ${firstError.message}`;
  }

  const filePath = path.isAbsolute(firstError.loc.file)
    ? path.relative(projectRoot, firstError.loc.file)
    : firstError.loc.file;

  return `Failed to compile ${filePath}:${firstError.loc.line}:${firstError.loc.column + 1}: ${firstError.message}`;
}
