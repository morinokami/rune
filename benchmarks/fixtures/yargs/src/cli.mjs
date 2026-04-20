import yargs from "yargs";
import { hideBin } from "yargs/helpers";

yargs(hideBin(process.argv))
  .scriptName("bench-cli")
  .command(
    "greet <name>",
    "Print a greeting",
    (y) =>
      y.positional("name", { type: "string", demandOption: true }).option("loud", {
        type: "boolean",
        default: false,
        description: "Uppercase",
      }),
    (argv) => {
      const msg = `hello, ${argv.name}`;
      console.log(argv.loud ? msg.toUpperCase() : msg);
    },
  )
  .command("math", "Math utilities", (y) =>
    y
      .command(
        "add <a> <b>",
        "Add two integers",
        (y2) =>
          y2
            .positional("a", { type: "number", demandOption: true })
            .positional("b", { type: "number", demandOption: true }),
        (argv) => {
          console.log(String(argv.a + argv.b));
        },
      )
      .demandCommand(1)
      .strict(),
  )
  .command(
    "heavy",
    "Run a heavy operation (loads the TypeScript compiler)",
    () => {},
    async () => {
      const { run } = await import("./heavy.mjs");
      run();
    },
  )
  .demandCommand(1)
  .strict()
  .parse();
