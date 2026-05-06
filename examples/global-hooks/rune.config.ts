import { defineConfig } from "@rune-cli/rune";

export default defineConfig({
  name: "global-hooks",
  hooks: {
    beforeRun({ output }) {
      output.log("before run");
    },
    afterRun({ output }) {
      output.log("after run");
    },
    onRunError({ output, stage, error }) {
      output.error(`${stage} failed: ${error.message}`);
    },
  },
});
