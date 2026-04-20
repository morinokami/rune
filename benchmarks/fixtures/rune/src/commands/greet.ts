import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Print a greeting",
  args: [{ name: "name", type: "string", required: true }],
  options: [{ name: "loud", type: "boolean", default: false, description: "Uppercase" }],
  run({ args, options, output }) {
    const msg = `hello, ${args.name}`;
    output.log(options.loud ? msg.toUpperCase() : msg);
  },
});
