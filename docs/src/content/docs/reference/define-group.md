---
title: defineGroup()
description: API reference for the defineGroup function.
---

`defineGroup()` defines metadata for a command group. Place the default export of this function in a `_group.ts` file inside a command directory.

`_group.ts` is the reserved file for command group metadata. It is not treated as a command, and it must not coexist with `index.ts` in the same directory.

```ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
```

## Properties

### `description`

- **Type:** `string`
- **Required**

A one-line summary shown in `--help` output when the group is invoked.

### `aliases`

- **Type:** `readonly string[]`
- **Optional**

Alternative names for this group. Each alias is an additional path segment that routes to this group. Aliases must follow kebab-case rules (lowercase letters, digits, and internal hyphens). The root group cannot have aliases.

### `examples`

- **Type:** `readonly string[]`
- **Optional**

Usage examples shown in the `Examples:` section of `--help` output. Each entry is a string representing a full command invocation.
