import { defineCommand } from "@rune-cli/rune";
import path from "node:path";

import { detectPackageManager } from "../detect-package-manager.ts";
import { scaffoldProject } from "../scaffold-project.ts";

// Root command for scaffolding a new Rune CLI project.
export default defineCommand({
  description: "Create a new Rune CLI project",
  args: [
    {
      name: "projectName",
      type: "string",
      required: true,
      description: "Directory name for the new project",
    },
  ],
  async run(ctx) {
    const scaffoldedProject = await scaffoldProject(ctx.args.projectName, ctx.cwd);
    const relativeProjectPath = path.relative(ctx.cwd, scaffoldedProject.projectRoot);
    const pm = detectPackageManager();

    console.log(`Created Rune project at ${relativeProjectPath || scaffoldedProject.cliName}`);
    console.log("");
    console.log("Next steps:");
    console.log(`  cd ${relativeProjectPath || scaffoldedProject.cliName}`);
    console.log(`  ${pm.installCommand}`);
    console.log(`  ${pm.runCommand("dev", "hello")}`);
  },
});
