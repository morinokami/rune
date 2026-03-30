export interface PackageManager {
  readonly name: string;
  readonly installCommand: string;
  readonly installArgs: readonly string[];
  readonly runCommand: (script: string, args: string) => string;
}

// Detects the package manager used to invoke this CLI from the
// npm_config_user_agent environment variable (e.g. "pnpm/9.0.0 node/v22.0.0").
// Falls back to "npm" when the variable is absent.
export function detectPackageManager(): PackageManager {
  const userAgent = process.env.npm_config_user_agent;
  const name = userAgent ? userAgent.split(" ")[0].split("/")[0] : undefined;

  switch (name) {
    case "yarn":
      return {
        name: "yarn",
        installCommand: "yarn",
        installArgs: [],
        runCommand: (script, args) => `yarn ${script} ${args}`,
      };
    case "pnpm":
      return {
        name: "pnpm",
        installCommand: "pnpm install",
        installArgs: ["install"],
        runCommand: (script, args) => `pnpm ${script} ${args}`,
      };
    case "bun":
      return {
        name: "bun",
        installCommand: "bun install",
        installArgs: ["install"],
        runCommand: (script, args) => `bun ${script} ${args}`,
      };
    default:
      return {
        name: "npm",
        installCommand: "npm install",
        installArgs: ["install"],
        runCommand: (script, args) => `npm run ${script} -- ${args}`,
      };
  }
}
