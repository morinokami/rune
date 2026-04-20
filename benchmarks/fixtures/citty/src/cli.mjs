import { defineCommand, runMain } from "citty";

const greet = defineCommand({
  meta: { name: "greet", description: "Print a greeting" },
  args: {
    name: { type: "positional", required: true },
    loud: { type: "boolean", default: false, description: "Uppercase" },
  },
  run({ args }) {
    const msg = `hello, ${args.name}`;
    console.log(args.loud ? msg.toUpperCase() : msg);
  },
});

const add = defineCommand({
  meta: { name: "add", description: "Add two integers" },
  args: {
    a: { type: "positional", required: true },
    b: { type: "positional", required: true },
  },
  run({ args }) {
    console.log(String(Number(args.a) + Number(args.b)));
  },
});

const math = defineCommand({
  meta: { name: "math", description: "Math utilities" },
  subCommands: { add },
});

const main = defineCommand({
  meta: { name: "bench-cli", description: "Benchmark CLI" },
  subCommands: {
    greet,
    math,
    heavy: () => import("./heavy.mjs").then((m) => m.default),
  },
});

runMain(main);
