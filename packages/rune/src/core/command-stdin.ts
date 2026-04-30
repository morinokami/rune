import { TextDecoder, TextEncoder } from "node:util";

import { CommandError } from "./command-error";

export interface CommandStdin {
  readonly isTTY: boolean;
  readonly isPiped: boolean;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface CommandStdinSource {
  readonly isTTY: boolean;
  readonly isPiped: boolean;
  read(): Promise<Uint8Array>;
}

type StdinStream = AsyncIterable<unknown> & {
  readonly isTTY?: boolean | undefined;
};

const STDIN_CONSUMED_ERROR_KIND = "rune/stdin-consumed";

export function createCommandStdin(source: CommandStdinSource): CommandStdin {
  let consumed = false;

  async function readOnce(): Promise<Uint8Array> {
    if (consumed) {
      throw new CommandError({
        kind: STDIN_CONSUMED_ERROR_KIND,
        message: "stdin has already been consumed",
      });
    }

    consumed = true;
    return source.read();
  }

  return {
    isTTY: source.isTTY,
    isPiped: source.isPiped,
    async text() {
      return new TextDecoder().decode(await readOnce());
    },
    async bytes() {
      return readOnce();
    },
  };
}

export function createProcessStdinSource(stream: StdinStream = process.stdin): CommandStdinSource {
  const isTTY = stream.isTTY === true;

  return {
    isTTY,
    isPiped: !isTTY,
    async read() {
      return collectChunks(stream);
    },
  };
}

export function createBytesStdinSource(
  input: string | Uint8Array,
  options?: { readonly isTTY?: boolean | undefined; readonly isPiped?: boolean | undefined },
): CommandStdinSource {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : copyBytes(input);
  const isTTY = options?.isTTY ?? false;

  return {
    isTTY,
    isPiped: options?.isPiped ?? !isTTY,
    async read() {
      return copyBytes(bytes);
    },
  };
}

async function collectChunks(input: AsyncIterable<unknown>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;

  for await (const chunk of input) {
    const bytes = chunkToBytes(chunk);
    chunks.push(bytes);
    length += bytes.byteLength;
  }

  return concatBytes(chunks, length);
}

function chunkToBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === "string") {
    return new TextEncoder().encode(chunk);
  }

  if (chunk instanceof Uint8Array) {
    return copyBytes(chunk);
  }

  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk.slice(0));
  }

  throw new TypeError("stdin produced an unsupported chunk type");
}

function concatBytes(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
