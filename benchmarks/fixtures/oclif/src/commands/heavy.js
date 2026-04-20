import { Command } from "@oclif/core";
import ts from "typescript";

export default class Heavy extends Command {
  static description = "Run a heavy operation (loads the TypeScript compiler)";

  async run() {
    this.log(`typescript ${ts.version}`);
  }
}
