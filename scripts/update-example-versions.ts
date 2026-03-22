import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("..", import.meta.url));

async function listSubdirectories(directory: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(rootDirectory, directory), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name));
}

// Collect workspace package names and their current versions.
const packageToVersion = new Map<string, string>();

for (const directory of await listSubdirectories("packages")) {
  const packageJsonPath = path.join(rootDirectory, directory, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  if (!packageJson || packageJson.private === true) continue;

  const name = packageJson.name as string | undefined;
  const version = packageJson.version as string | undefined;
  if (!name || !version) {
    throw new Error(`${packageJsonPath} is missing "name" or "version".`);
  }

  packageToVersion.set(name, version);
}

// Update dependencies in every example's package.json.
for (const directory of await listSubdirectories("examples")) {
  const packageJsonPath = path.join(rootDirectory, directory, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  if (!packageJson) continue;

  let changed = false;

  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = packageJson[field] as Record<string, string> | undefined;
    if (!deps) continue;

    for (const depName of Object.keys(deps)) {
      const version = packageToVersion.get(depName);
      if (version !== undefined) {
        deps[depName] = `^${version}`;
        changed = true;
      }
    }
  }

  if (changed) {
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");
  }
}

async function readPackageJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
