import { define } from "gunshi";
import ts from "typescript";

export default define({
  name: "heavy",
  description: "Run a heavy operation (loads the TypeScript compiler)",
  run: () => {
    console.log(`typescript ${ts.version}`);
  },
});
