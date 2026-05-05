const guardedStreams = new WeakSet<NodeJS.WriteStream>();

export class BrokenPipeError extends Error {
  readonly code = "EPIPE";

  constructor() {
    super("Broken pipe");
    this.name = "BrokenPipeError";
  }
}

export function isBrokenPipeError(error: unknown): boolean {
  return (
    error instanceof BrokenPipeError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { readonly code?: unknown }).code === "EPIPE")
  );
}

/**
 * Installs a persistent error listener that absorbs EPIPE and rethrows other
 * stream errors on the next tick. Idempotent for each process stream.
 */
export function installBrokenPipeGuard(stream: NodeJS.WriteStream): void {
  if (guardedStreams.has(stream)) {
    return;
  }

  guardedStreams.add(stream);
  stream.on("error", (error) => {
    if (isBrokenPipeError(error)) {
      return;
    }

    process.nextTick(() => {
      throw error;
    });
  });
}
