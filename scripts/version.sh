#!/usr/bin/env bash
# Called by changesets/action as the "version" command.
# The action splits the command string on whitespace and passes each token
# as a literal argument via @actions/exec (no shell), so shell operators
# like "&&" cannot be used inline. This script works around that limitation.

set -euo pipefail

vpx changeset version

# "changeset version" also updates examples/ via updateInternalDependencies,
# but that causes a lockfile mismatch because the new version isn't published yet.
# Example versions are updated at the right time by update-example-versions.ts
# after "changeset publish", so we revert the premature changes here.
git checkout examples/
