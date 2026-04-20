import { Args, Command } from "@oclif/core";

export default class MathAdd extends Command {
  static description = "Add two integers";
  static args = {
    a: Args.integer({ description: "First operand", required: true }),
    b: Args.integer({ description: "Second operand", required: true }),
  };

  async run() {
    const { args } = await this.parse(MathAdd);
    this.log(String(args.a + args.b));
  }
}
