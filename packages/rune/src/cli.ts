#!/usr/bin/env node

import { runRuneCli } from "./cli/rune-cli";
import { writeCommandExecutionResult } from "./cli/write-result";

const result = await runRuneCli({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
});

await writeCommandExecutionResult(result);
