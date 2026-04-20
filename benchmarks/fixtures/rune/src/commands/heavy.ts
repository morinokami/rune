import { defineCommand } from "@rune-cli/rune";
import ts from "typescript";

export default defineCommand({
  description: "Run a heavy operation (loads the TypeScript compiler)",
  run({ output }) {
    output.log(`typescript ${ts.version}`);
  },
});
