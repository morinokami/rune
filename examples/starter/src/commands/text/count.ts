import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Count words or characters in the input",
  options: [
    {
      name: "unit",
      type: "enum",
      values: ["words", "chars"],
      default: "words",
      description: "What to count",
    },
  ],
  args: [
    {
      name: "input",
      type: "string",
      required: true,
    },
  ],
  run({ options, args, output }) {
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
