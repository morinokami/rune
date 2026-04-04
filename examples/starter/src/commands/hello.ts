import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello from your new Rune CLI",
  run({ output }) {
    output.info("hello from my-cli");
  },
});
