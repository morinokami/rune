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

function ensureTrailingNewline(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}

export async function writeStdout(contents: string): Promise<void> {
  await writeStream(process.stdout, contents);
}

export async function writeStderr(contents: string): Promise<void> {
  await writeStream(process.stderr, contents);
}

export async function writeStderrLine(contents: string): Promise<void> {
  await writeStderr(ensureTrailingNewline(contents));
}
