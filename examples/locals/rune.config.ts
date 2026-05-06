import { defineConfig } from "@rune-cli/rune";
import { basename } from "node:path";

export default defineConfig({
  name: "locals",
  locals(ctx) {
    return {
      workspaceName: basename(ctx.cwd),
      invokedAs: [ctx.command.cliName, ...ctx.command.path].join(" "),
      startedAt: new Date().toISOString(),
    };
  },
});
