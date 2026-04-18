import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Count words or characters in the input",
  args: [
    {
      name: "input",
      type: "string",
      required: true,
    },
  ],
  options: [
    {
      name: "unit",
      type: "enum",
      values: ["words", "chars"],
      default: "words",
      description: "What to count",
    },
  ],
  run({ args, options, output }) {
    const { input } = args;
    let result: number;
    if (options.unit === "chars") {
      result = input.length;
    } else {
      const trimmed = input.trim();
      result = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
    }
    output.log(String(result));
  },
});
