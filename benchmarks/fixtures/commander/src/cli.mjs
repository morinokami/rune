import { Command } from "commander";

const program = new Command();
program.name("bench-cli").description("Benchmark CLI").version("0.0.0");

program
  .command("greet <name>")
  .description("Print a greeting")
  .option("--loud", "Uppercase", false)
  .action((name, opts) => {
    const msg = `hello, ${name}`;
    console.log(opts.loud ? msg.toUpperCase() : msg);
  });

const math = program.command("math").description("Math utilities");
math
  .command("add <a> <b>")
  .description("Add two integers")
  .action((a, b) => {
    console.log(String(Number(a) + Number(b)));
  });

program
  .command("heavy")
  .description("Run a heavy operation (loads the TypeScript compiler)")
  .action(async () => {
    const { run } = await import("./heavy.mjs");
    run();
  });

await program.parseAsync();
