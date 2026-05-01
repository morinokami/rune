import { defineCommand } from "@rune-cli/rune";
import { type } from "arktype";
import * as v from "valibot";
import { z } from "zod";

export default defineCommand({
  description: "Greet someone, validating each option with a different Standard Schema library",
  options: [
    {
      name: "name",
      schema: z.string().min(1).max(50),
      typeLabel: "string",
      description: "Name to greet (validated with Zod)",
    },
    {
      name: "email",
      schema: v.pipe(v.string(), v.trim(), v.email()),
      typeLabel: "string",
      description: "Contact email (validated with Valibot)",
    },
    {
      name: "age",
      schema: type("string.integer.parse").to("number >= 0"),
      typeLabel: "number",
      description: "Age in years (validated with ArkType)",
    },
  ],
  run({ options, output }) {
    output.log(`Hello, ${options.name} (${options.age})!`);
    output.log(`We'll reach you at ${options.email}.`);
  },
});
