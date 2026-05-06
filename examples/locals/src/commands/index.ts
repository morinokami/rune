import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Print values created by defineConfig({ locals })",
  run({ locals, output }) {
    output.log(`workspace: ${locals.workspaceName}`);
    output.log(`command: ${locals.invokedAs}`);
    output.log(`started: ${locals.startedAt}`);
  },
});
