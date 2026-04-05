---
title: コマンド
description: Rune におけるコマンドの定義方法について学ぶ。
---

## コマンドの定義

[ルーティング](/ja/guides/routing/)のガイドでも述べたように、Rune では `src/commands` 以下の `index.ts` または通常の `.ts` ファイルにより個別のコマンドを定義します。コマンドの定義ファイル内では、`defineCommand()` 関数を使用します。この関数は、コマンドの説明文や引数、オプション、コマンドの実体となる `run` 関数などを指定するためのオブジェクトを受け取り、コマンドオブジェクトを返します。このオブジェクトをデフォルトエクスポートすることで、Rune はそのファイルをプロジェクトのコマンドとして認識します。

以下は英語で挨拶するコマンドの定義例です。位置引数 `args` とオプション `options` をまず定義し、その後に `run` 関数を定義してコマンドのビジネスロジックを与えています:

```ts
// src/commands/index.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Greet someone",
  args: [
    {
      name: "name",
      type: "string",
      required: true,
    },
  ],
  options: [
    {
      name: "loud",
      type: "boolean",
    },
  ],
  run({ args, options }) {
    const greeting = `Hello, ${args.name}!`;
    console.log(options.loud ? greeting.toUpperCase() : greeting);
  },
});
```

このコマンドの実行例は次のようになります:

```bash
$ my-cli --help
Usage: my-cli <name> [options]

Description:
  Greet someone

Arguments:
  name <string>

Options:
  --loud <boolean>
  -h, --help  Show help

$ my-cli foo
Hello, foo!

$ my-cli foo --loud
HELLO, FOO!
```

## コマンドファイルの種類

`src/commands` 以下に配置するファイルの種類によって、コマンドとしての登録のされ方が変わります。

### `index.ts`

ディレクトリに `index.ts` を置くと、そのディレクトリパス自体が実行可能なコマンドになります。たとえば `src/commands/project/index.ts` は `your-cli project` として実行できます。

`src/commands/index.ts` はルートコマンド（引数なしで CLI を実行したとき）に対応します。

### その他の `.ts` ファイル

`index.ts` 以外の `.ts` ファイルは、そのファイル名がそのままサブコマンド名になります。たとえば `src/commands/project/create.ts` は `your-cli project create` に対応します。

ディレクトリを作らずにサブコマンドを定義できるため、子コマンドが不要なシンプルなコマンドに向いています。

## グループ

サブコマンドをもつディレクトリは、自動的にコマンドグループとして機能します。グループに説明文やエイリアスなどのメタデータを付与するには、ディレクトリ内に `_group.ts` を配置し、`defineGroup()` 関数を使用します。

```ts
// src/commands/project/_group.ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
```

この例では、`your-cli project` を実行すると、説明文とサブコマンドの一覧を含むヘルプが表示されます。

`_group.ts` と `index.ts` は同じディレクトリに共存できません。ディレクトリパス自体を実行可能にしたい場合は `index.ts` を、サブコマンドのグループとしてのみ機能させたい場合は `_group.ts` を使用してください。

## エイリアス

コマンドやグループには、エイリアス（別名）を設定できます。エイリアスを定義すると、元のコマンド名に加えて別名でも同じコマンドを呼び出せるようになります。

```ts
// src/commands/project/create.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a new project",
  aliases: ["new"],
  run() {
    // ...
  },
});
```

この例では、`your-cli project create` と `your-cli project new` のどちらでも同じコマンドが実行されます。

エイリアスには次の制約があります:

- 同じ階層のコマンド間でエイリアスが衝突することはできません。
- ルートコマンドにはエイリアスを設定できません。
