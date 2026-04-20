import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Add two integers",
  args: [
    { name: "a", type: "number", required: true },
    { name: "b", type: "number", required: true },
  ],
  run({ args, output }) {
    output.log(String(args.a + args.b));
  },
});
