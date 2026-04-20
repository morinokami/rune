---
title: Deployment
description: Learn how to deploy your Rune CLI application.
---

CLIs built with Rune can be published as regular npm packages. The Rune starter is set up to expose `dist/cli.mjs` as its `bin` entry, so once you have the package metadata ready, you can run `rune build` and publish it to npm.

This guide covers the minimum steps required to publish a Rune CLI to npm.

## Check `package.json`

Before publishing to npm, make sure at least these fields are set correctly:

- `name`: the package name on npm
- `version`: the version you want to publish
- `bin`: the CLI entry point. In the starter, this defaults to `dist/cli.mjs`
- `files`: the files included in the published package. In the starter, this defaults to `["dist"]`
- `type`: `"module"` so the package is published as ESM
- `private`: generated projects remove this automatically; if you copied the in-repo starter directly, remove `true` before publishing
- `engines`: the supported Node.js version range

In the starter, the main publishing-related fields in `package.json` look like this:

```json
{
  "name": "my-cli",
  "version": "0.0.0",
  "bin": {
    "my-cli": "dist/cli.mjs"
  },
  "files": [
    "dist"
  ],
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  }
}
```

Before you publish, replace `name` and `version` with your real package values. If you copied the in-repo starter directly instead of scaffolding through `create-rune-app`, also remove `private: true` or change it to `false`.

## Run `rune build`

Rune generates the publishable CLI with `rune build`. Always build before running `npm publish`.

```sh
npm run build
```

After a successful build, `dist/` will contain files such as:

- `dist/cli.mjs`: the CLI entry point referenced by `bin`
- `dist/manifest.json`: the command tree manifest
- `dist/commands/...`: the built module for each command

## Where dependencies should go

When you build a Rune CLI, your application source is emitted into `dist/`, but third-party packages are still resolved at runtime like a normal npm package. That means any third-party package imported by your commands at runtime must be listed in `dependencies`.

- Packages loaded at runtime belong in `dependencies`
- Packages not needed when the published CLI runs can stay in `devDependencies`

For example, if a command imports `chalk`, `chalk` should be a runtime dependency:

```ts
import { defineCommand } from "@rune-cli/rune";
import chalk from "chalk";

export default defineCommand({
  run({ output }) {
    output.log(chalk.green("ok"));
  },
});
```

By contrast, packages used only during development, such as `vitest` or `typescript`, can remain in `devDependencies`. `@rune-cli/rune` can also remain in `devDependencies`, because Rune's runtime is bundled at build time.

## Inspect the published package with `npm pack`

Before actually publishing, it is a good idea to inspect the tarball that npm will create:

```sh
npm pack
```

This lets you verify exactly what would be uploaded to npm. In particular, check that:

- `dist/` is included
- source files and tests that should stay private are not included
- `bin` points to `dist/cli.mjs`

## Publish to npm

Once everything looks correct, log in to npm and publish:

```sh
npm login
npm publish
```

If you are publishing a scoped package such as `@your-org/my-cli` and want it to be public, add `--access public`. See the [npm guide to creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) for details.

```sh
npm publish --access public
```

After publishing, you can run the CLI like this:

```sh
npx my-cli hello
```

Or you can install it globally and run it as a regular command:

```sh
npm install -g my-cli
my-cli hello
```

## Common mistakes

- `private: true` is still present in `package.json` after copying the in-repo starter directly
- `rune build` was not run before publishing
- A runtime dependency was placed in `devDependencies`
- The package is scoped, but `npm publish --access public` was omitted

If you see an error such as `Cannot find package ...` after publishing, first check whether that package should be in `dependencies`.
