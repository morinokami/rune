#!/usr/bin/env node

import { runRuneCli } from "./cli/rune-cli";

process.exitCode = await runRuneCli({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
});
