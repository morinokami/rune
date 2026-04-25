import type { ProjectPackageJson } from "../project/project-files";

export function getRuntimeDependencyWarnings(
  packageJson: ProjectPackageJson | undefined,
  externalPackages: ReadonlySet<string>,
): readonly string[] {
  const warnings: string[] = [];

  for (const packageName of [...externalPackages].sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (isDeclaredRuntimeDependency(packageJson, packageName)) {
      continue;
    }

    if (isDevDependencyOnly(packageJson, packageName)) {
      warnings.push(
        `Warning: Runtime dependency "${packageName}" is listed in devDependencies. Move it to dependencies, optionalDependencies, or peerDependencies before publishing.`,
      );
      continue;
    }

    warnings.push(
      `Warning: Runtime dependency "${packageName}" is not declared in package.json. Add it to dependencies, optionalDependencies, or peerDependencies before publishing.`,
    );
  }

  return warnings;
}

function isDeclaredRuntimeDependency(
  packageJson: ProjectPackageJson | undefined,
  packageName: string,
): boolean {
  return (
    packageJson?.dependencies?.[packageName] !== undefined ||
    packageJson?.optionalDependencies?.[packageName] !== undefined ||
    packageJson?.peerDependencies?.[packageName] !== undefined
  );
}

function isDevDependencyOnly(
  packageJson: ProjectPackageJson | undefined,
  packageName: string,
): boolean {
  return (
    packageJson?.devDependencies?.[packageName] !== undefined &&
    !isDeclaredRuntimeDependency(packageJson, packageName)
  );
}
