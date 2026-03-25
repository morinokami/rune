import { expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
import { captureProcessOutput } from "../src/capture-output";
import { executeCommand } from "../src/execute-command";

function unwrap<T>(captured: Awaited<ReturnType<typeof captureProcessOutput<T>>>) {
  if (!captured.ok) {
    throw captured.error;
  }

  return captured;
}

// ---------------------------------------------------------------------------
// Context injection & defaults
// ---------------------------------------------------------------------------

test("executeCommand runs a command with injected context", async () => {
  const command = defineCommand({
    args: [{ name: "id", type: "string", required: true }],
    options: [{ name: "name", type: "string", required: true }],
    async run(ctx) {
      console.log(`name=${ctx.options.name}`);
      console.log(`id=${ctx.args.id}`);
      console.log(`cwd=${ctx.cwd}`);
      console.log(`raw=${ctx.rawArgs.join(",")}`);
    },
  });

  const captured = unwrap(
    await captureProcessOutput(() =>
      executeCommand(command, {
        options: { name: "rune" },
        args: { id: "42" },
        cwd: "/tmp/rune-project",
        rawArgs: ["project", "42", "--name", "rune"],
      }),
    ),
  );

  expect(captured.stdout).toBe(
    ["name=rune", "id=42", "cwd=/tmp/rune-project", "raw=project,42,--name,rune", ""].join("\n"),
  );
  expect(captured.stderr).toBe("");
  expect(captured.value).toEqual({ exitCode: 0 });
});

test("executeCommand falls back to process defaults", async () => {
  const command = defineCommand({
    run(ctx) {
      console.log(`cwd=${ctx.cwd}`);
      console.log(`raw=${ctx.rawArgs.join(",")}`);
    },
  });

  const captured = unwrap(await captureProcessOutput(() => executeCommand(command)));

  expect(captured.stdout).toBe([`cwd=${process.cwd()}`, "raw=", ""].join("\n"));
  expect(captured.value).toEqual({ exitCode: 0 });
});

test("executeCommand defaults omitted boolean options to false", async () => {
  const command = defineCommand({
    options: [{ name: "force", type: "boolean" }],
    run(ctx) {
      console.log(`force=${ctx.options.force}`);
    },
  });

  const captured = unwrap(
    await captureProcessOutput(() => executeCommand(command, { options: {} })),
  );

  expect(captured.stdout).toBe("force=false\n");
  expect(captured.value).toEqual({ exitCode: 0 });
});

test("executeCommand accepts omitted required and default-backed fields", async () => {
  const command = defineCommand({
    options: [
      { name: "name", type: "string", required: true },
      { name: "count", type: "number", default: 1 },
    ],
    run() {
      console.log("no validation");
    },
  });

  const captured = unwrap(
    await captureProcessOutput(() => executeCommand(command, { options: {} })),
  );

  expect(captured.stdout).toBe("no validation\n");
  expect(captured.value).toEqual({ exitCode: 0 });
});

test("executeCommand supports synchronous run functions", async () => {
  const command = defineCommand({
    run() {
      console.log("sync");
    },
  });

  const captured = unwrap(await captureProcessOutput(() => executeCommand(command)));

  expect(captured.stdout).toBe("sync\n");
  expect(captured.value).toEqual({ exitCode: 0 });
});

test("executeCommand lets stderr flow through", async () => {
  const command = defineCommand({
    async run() {
      process.stderr.write("warning\n");
    },
  });

  const captured = unwrap(await captureProcessOutput(() => executeCommand(command)));

  expect(captured.stdout).toBe("");
  expect(captured.stderr).toBe("warning\n");
  expect(captured.value).toEqual({ exitCode: 0 });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

test("executeCommand returns a non-zero result when a command throws", async () => {
  const command = defineCommand({
    async run() {
      console.log("before failure");
      process.stderr.write("partial stderr\n");
      throw new Error("Boom");
    },
  });

  const captured = unwrap(await captureProcessOutput(() => executeCommand(command)));

  expect(captured.stdout).toBe("before failure\n");
  expect(captured.stderr).toBe("partial stderr\n");
  expect(captured.value).toEqual({ exitCode: 1, errorMessage: "Boom" });
});

test("executeCommand preserves an empty Error message", async () => {
  const command = defineCommand({
    run() {
      throw new Error("");
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({ exitCode: 1 });
});

test("executeCommand normalizes non-Error throws", async () => {
  const command = defineCommand({
    run() {
      throw { code: "ENOPE" };
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({ exitCode: 1, errorMessage: "Unknown error" });
});
