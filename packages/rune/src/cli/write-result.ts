import type { CommandExecutionResult } from "@rune-cli/core";

async function writeStream(stream: NodeJS.WriteStream, contents: string): Promise<void> {
  if (contents.length === 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    stream.write(contents, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function writeCommandExecutionResult(result: CommandExecutionResult): Promise<void> {
  await writeStream(process.stdout, result.stdout);
  await writeStream(process.stderr, result.stderr);
  process.exitCode = result.exitCode;
}
