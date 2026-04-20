import { Args, Command, Flags } from "@oclif/core";

export default class Greet extends Command {
  static description = "Print a greeting";
  static args = {
    name: Args.string({ description: "Name to greet", required: true }),
  };
  static flags = {
    loud: Flags.boolean({ default: false, description: "Uppercase" }),
  };

  async run() {
    const { args, flags } = await this.parse(Greet);
    const msg = `hello, ${args.name}`;
    this.log(flags.loud ? msg.toUpperCase() : msg);
  }
}
