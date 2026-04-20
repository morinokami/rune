import { defineCommand } from "citty";
import ts from "typescript";

export default defineCommand({
  meta: {
    name: "heavy",
    description: "Run a heavy operation (loads the TypeScript compiler)",
  },
  run() {
    console.log(`typescript ${ts.version}`);
  },
});
