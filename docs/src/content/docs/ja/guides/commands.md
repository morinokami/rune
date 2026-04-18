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
  run({ args, options, output }) {
    const greeting = `Hello, ${args.name}!`;
    output.log(options.loud ? greeting.toUpperCase() : greeting);
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
  --loud
  -h, --help  Show help

$ my-cli foo
Hello, foo!

$ my-cli foo --loud
HELLO, FOO!
```

通常の標準出力には `output.log()`、標準エラー出力には `output.error()` を使用してください。これにより `runCommand()` で出力をテストしやすくなり、`json: true` のコマンドを `--json` 付きで実行したときには人間向けの stdout を Rune が抑制できるようになります。詳しくは [JSON 出力](/ja/guides/json/) ガイドを参照してください。

## コマンドファイルの種類

`src/commands` 以下に配置するファイルの種類によって、コマンドとしての登録のされ方が変わります。

### `index.ts`

ディレクトリに `index.ts` を置くと、そのディレクトリパス自体が実行可能なコマンドになります。たとえば `src/commands/project/index.ts` は `your-cli project` として実行できます。

`src/commands/index.ts` はルートコマンド（引数なしで CLI を実行したとき）に対応します。

たとえば次のファイルは、引数なしで `your-cli` を実行したときの挙動を定義します:

```ts
// src/commands/index.ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Show the default workspace summary",
  run({ output }) {
    output.log("workspace summary");
  },
});
```

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

### `index.ts` と `_group.ts` の選び方

ディレクトリパス自体を実行可能なコマンドにしたい場合は `index.ts` を使い、子コマンドを整理するためのヘルプ専用ノードにしたい場合は `_group.ts` を使います。

| こうしたい場合 | 使うもの |
|---|---|
| 引数なしの `your-cli` で何かを実行したい | `src/commands/index.ts` |
| `your-cli project` 自体も実行可能にしつつ、`your-cli project create` のような子コマンドも持たせたい | `src/commands/project/index.ts` |
| `your-cli project` は `create` や `list` を束ねるだけのヘルプ用ノードにしたい | `src/commands/project/_group.ts` |
| `your-cli hello` のような子を持たない単純な leaf command を定義したい | `src/commands/hello.ts` または `src/commands/hello/index.ts` |

目安としては、実行可能なコマンドには `index.ts`、ヘルプ専用の親ノードには `_group.ts` を選ぶのが自然です。

## 完全な `--help` 出力の例

次の構成では、ルートコマンド、ヘルプ専用グループ、2 つの leaf command が組み合わさっています:

```text
src/commands/
  index.ts
  project/
    _group.ts
    create.ts
    list.ts
```

このとき `your-cli project --help` は、次のような出力になります:

```text
Manage projects

Usage: your-cli project <command>

Subcommands:
  create  Create a project
  list    List projects

Options:
  -h, --help  Show help
```

`_group.ts` で定義したグループではこのように、グループの説明文は `Description:` セクション見出しなしで `Usage:` の前にそのまま表示され、実行時には一致した leaf command モジュールだけが読み込まれます。

## enum フィールド

値を固定された選択肢のいずれかに制限したい場合は、`type: "enum"` と `values` のリストを使用します。文字列と数値の両方を値として指定でき、許可された値の union 型は自動的に推論されます（`as const` は不要です）。選択肢は `--help` にも表示されます。

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Build the project",
  args: [{ name: "target", type: "enum", values: ["web", "node"], required: true }],
  options: [
    {
      name: "mode",
      type: "enum",
      values: ["dev", "prod"],
      default: "dev",
      description: "Build mode",
    },
  ],
  run({ args, options, output }) {
    // args.target は "web" | "node"、options.mode は "dev" | "prod"
    output.log(`Building ${args.target} in ${options.mode} mode`);
  },
});
```

CLI のトークンは宣言された値と厳密な文字列比較で照合されます。そのため `values: [1, 2]` は `--level 1` を受け付けますが、`--level 01` は受け付けません。`values` に含まれない値が渡された場合は、許可された選択肢を含む分かりやすいエラーが表示されます。

実行時に正規表現や一意性のチェック、値の変換などが必要な場合は Standard Schema フィールドを使用してください。詳細は [Standard Schema](/ja/guides/standard-schema/) を参照してください。

## kebab-case のフィールド名

引数やオプションの名前にハイフンを含む場合（例: `dry-run`）、`ctx.args` や `ctx.options` ではもとの名前に加えて camelCase 形式でもアクセスできます:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [{ name: "dry-run", type: "boolean" }],
  run({ options }) {
    // どちらでもアクセス可能
    console.log(options["dry-run"]);
    console.log(options.dryRun);
  },
});
```

この対応は型レベルでも保証されており、どちらの形式でも補完が効きます。

## 否定形の boolean オプション

プリミティブの boolean オプションに `default: true` を設定すると、Rune は `--no-<name>` フラグを自動生成し、デフォルト値を上書きできるようにします:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  options: [
    {
      name: "color",
      type: "boolean",
      default: true,
      description: "Colorize output",
    },
  ],
  run({ options }) {
    console.log(options.color);
  },
});
```

```bash
$ my-cli             # options.color -> true（デフォルト）
$ my-cli --color     # options.color -> true
$ my-cli --no-color  # options.color -> false
```

`--help` 出力には両方の形式がまとめて表示されます:

```
Options:
  --color, --no-color  Colorize output
  -h, --help           Show help
```

`--color` と `--no-color` を同時に指定するとエラーになります。

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
