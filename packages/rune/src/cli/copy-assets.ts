import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const CODE_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

function isCodeSourceFile(filePath: string): boolean {
  return CODE_SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isDeclarationFile(filePath: string): boolean {
  return filePath.endsWith(".d.ts") || filePath.endsWith(".d.mts") || filePath.endsWith(".d.cts");
}

// Recursively copies non-code assets from `sourceDirectory` to `targetDirectory`,
// preserving the source layout so that `import.meta.url`-relative references
// remain valid at runtime. Code and declaration files are skipped because they
// are handled by the Rolldown bundling step.
export async function copyBuiltAssets(
  sourceDirectory: string,
  targetDirectory: string,
): Promise<void> {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const sourceEntryPath = path.join(sourceDirectory, entry.name);
      const targetEntryPath = path.join(targetDirectory, entry.name);

      if (entry.isDirectory()) {
        await copyBuiltAssets(sourceEntryPath, targetEntryPath);
        return;
      }

      if (isDeclarationFile(sourceEntryPath)) {
        return;
      }

      if (isCodeSourceFile(sourceEntryPath)) {
        return;
      }

      await mkdir(path.dirname(targetEntryPath), { recursive: true });
      await cp(sourceEntryPath, targetEntryPath);
    }),
  );
}
