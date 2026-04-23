import type { BundleError, InputOptions, Plugin, ResolveIdResult } from "rolldown";

import { stat } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const BUILD_TARGET = "node22";
const BUNDLED_PACKAGE_NAMES = new Set(["@rune-cli/core", "@rune-cli/rune", "std-env"]);
const NODE_MODULES_SEGMENT_RE = /(^|[\\/])node_modules([\\/]|$)/;

export interface ExternalDependenciesContext {
  readonly plugin: Plugin;
  readonly getExternalPackages: () => ReadonlySet<string>;
}

function isBareSpecifier(id: string): boolean {
  return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0") && !path.isAbsolute(id);
}

function resolvePackageName(specifier: string): string | undefined {
  if (!isBareSpecifier(specifier) || specifier.startsWith("node:")) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const segments = specifier.split("/");
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier;
  }

  const [packageName] = specifier.split("/");
  return packageName;
}

function shouldBundlePackage(specifier: string): boolean {
  const packageName = resolvePackageName(specifier);
  return packageName !== undefined && BUNDLED_PACKAGE_NAMES.has(packageName);
}

function isResolvedIdObject(
  resolved: ResolveIdResult,
): resolved is Exclude<ResolveIdResult, null | undefined | false | string> {
  return typeof resolved === "object" && resolved !== null && "id" in resolved;
}

function shouldExternalizeResolvedId(source: string, resolved: ResolveIdResult): boolean {
  if (!isBareSpecifier(source) || shouldBundlePackage(source)) {
    return false;
  }

  const resolvedId = isResolvedIdObject(resolved) ? resolved : undefined;

  if (!resolvedId) {
    return false;
  }

  return (
    resolvedId.external === true ||
    resolvedId.external === "absolute" ||
    NODE_MODULES_SEGMENT_RE.test(resolvedId.id)
  );
}

export function createExternalDependenciesContext(): ExternalDependenciesContext {
  const externalPackages = new Set<string>();

  return {
    getExternalPackages: () => externalPackages,
    plugin: {
      name: "rune-external-dependencies",
      async resolveId(source, importer, extraOptions) {
        if (!isBareSpecifier(source) || shouldBundlePackage(source)) {
          return null;
        }

        const resolved = await this.resolve(source, importer, {
          kind: extraOptions.kind,
          isEntry: extraOptions.isEntry,
          custom: extraOptions.custom,
          skipSelf: true,
        });

        if (!resolved || !shouldExternalizeResolvedId(source, resolved)) {
          return null;
        }

        const packageName = resolvePackageName(source);

        if (packageName !== undefined) {
          externalPackages.add(packageName);
        }

        return { id: source, external: true };
      },
    },
  };
}

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
