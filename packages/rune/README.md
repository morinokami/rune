# Rune

Rune is an agent-friendly CLI framework built around the concept of file-based command routing. Directory structure maps directly to CLI command structure.

> [!IMPORTANT]
> This package is experimental and unstable. Proceed with caution when using it.

## Getting Started

Scaffold a new project:

```bash
npm create rune-app my-cli
cd my-cli
npm install
```

This generates the following structure:

```
my-cli/
  src/
    commands/
      hello.ts
  package.json
  tsconfig.json
```

Run your CLI directly from source:

```bash
npx rune run -- hello
# => hello from my-cli
```

Build for production:

```bash
npx rune build
```

## Defining Commands

Commands are TypeScript files under `src/commands/`. The directory structure maps directly to the command structure:

```
src/commands/
  hello.ts                → my-cli hello
  project/
    index.ts              → my-cli project
    create.ts             → my-cli project create
    list.ts               → my-cli project list
```

Simple leaf commands can be bare files (`hello.ts`), while commands that need subcommands use a directory with `index.ts`.

Each command file exports a default `defineCommand()` call:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Greet someone",
  args: [{ name: "name", type: "string", required: true }],
  options: [{ name: "loud", type: "boolean", short: "l" }],
  run({ args, options }) {
    const greeting = `Hello, ${args.name}!`;
    console.log(options.loud ? greeting.toUpperCase() : greeting);
  },
});
```
