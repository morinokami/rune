import { expect, test } from "vite-plus/test";

import { defineCommand } from "../src";
import { executeCommand } from "../src/execute-command";

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

  const result = await executeCommand(command, {
    options: { name: "rune" },
    args: { id: "42" },
    cwd: "/tmp/rune-project",
    rawArgs: ["project", "42", "--name", "rune"],
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: ["name=rune", "id=42", "cwd=/tmp/rune-project", "raw=project,42,--name,rune", ""].join(
      "\n",
    ),
    stderr: "",
  });
});

test("executeCommand captures stderr output", async () => {
  const command = defineCommand({
    async run() {
      process.stderr.write("warning\n");
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 0,
    stdout: "",
    stderr: "warning\n",
  });
});

test("executeCommand supports synchronous run functions", async () => {
  const command = defineCommand({
    run() {
      console.log("sync");
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 0,
    stdout: "sync\n",
    stderr: "",
  });
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

  const result = await executeCommand(command, {
    options: {},
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "no validation\n",
    stderr: "",
  });
});

test("executeCommand returns a non-zero result when a command throws", async () => {
  const command = defineCommand({
    async run() {
      console.log("before failure");
      process.stderr.write("partial stderr\n");
      throw new Error("Boom");
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 1,
    stdout: "before failure\n",
    stderr: "partial stderr\nBoom\n",
  });
});

test("executeCommand preserves an empty Error message", async () => {
  const command = defineCommand({
    run() {
      throw new Error("");
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "",
  });
});

test("executeCommand normalizes non-Error throws", async () => {
  const command = defineCommand({
    run() {
      throw { code: "ENOPE" };
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: "Unknown error\n",
  });
});

test("executeCommand falls back to process defaults", async () => {
  const command = defineCommand({
    run(ctx) {
      console.log(`cwd=${ctx.cwd}`);
      console.log(`raw=${ctx.rawArgs.join(",")}`);
    },
  });

  const result = await executeCommand(command);

  expect(result).toEqual({
    exitCode: 0,
    stdout: [`cwd=${process.cwd()}`, "raw=", ""].join("\n"),
    stderr: "",
  });
});
