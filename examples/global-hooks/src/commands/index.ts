import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Print a greeting while global hooks log lifecycle events",
  options: [{ name: "name", type: "string", default: "Rune" }],
  run({ options, output }) {
    output.log(`Hello, ${options.name}!`);
  },
});
