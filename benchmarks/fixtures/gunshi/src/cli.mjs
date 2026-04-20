import { cli, define, lazy } from "gunshi";

const greet = define({
  name: "greet",
  description: "Print a greeting",
  args: {
    name: {
      type: "positional",
      required: true,
      description: "Name to greet",
    },
    loud: {
      type: "boolean",
      default: false,
      description: "Uppercase",
    },
  },
  run: (ctx) => {
    const msg = `hello, ${ctx.values.name}`;
    console.log(ctx.values.loud ? msg.toUpperCase() : msg);
  },
});

const add = define({
  name: "add",
  description: "Add two integers",
  args: {
    a: { type: "positional", required: true, description: "First operand" },
    b: { type: "positional", required: true, description: "Second operand" },
  },
  run: (ctx) => {
    console.log(String(Number(ctx.values.a) + Number(ctx.values.b)));
  },
});

const math = define({
  name: "math",
  description: "Math utilities",
  subCommands: { add },
  run: () => {},
});

const entry = define({
  name: "bench-cli",
  description: "Benchmark CLI",
  run: () => {},
});

const heavy = lazy(() => import("./heavy.mjs").then((m) => m.default), {
  name: "heavy",
  description: "Run a heavy operation (loads the TypeScript compiler)",
});

await cli(process.argv.slice(2), entry, {
  name: "bench-cli",
  version: "0.0.0",
  renderHeader: null,
  subCommands: { greet, math, heavy },
});
