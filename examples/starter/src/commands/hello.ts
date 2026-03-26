import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Say hello from your new Rune CLI",
  async run() {
    console.log("hello from my-cli");
  },
});
