---
title: defineCommand()
description: defineCommand 関数の API リファレンス。
---

`defineCommand()` は CLI コマンドを作成します。返却されるオブジェクトはファイルのデフォルトエクスポートとする必要があります。

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a new project",
  args: [{ name: "name", type: "string", required: true }],
  options: [{ name: "force", type: "boolean", short: "f" }],
  run({ args, options }) {
    // ...
  },
});
```

## プロパティ

### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示される一行の説明文。

### `args`

- **型:** `CommandArgField[]`
- **省略可能**

コマンドラインに現れる順序で宣言する位置引数。必須の引数は省略可能な引数よりも前に配置する必要があります。

各エントリは**プリミティブフィールド**または**スキーマフィールド**のいずれかです。フィールドは `type` または `schema` のいずれかを使用し、両方を同時に指定することはできません。

#### プリミティブフィールド

##### `name`

- **型:** `string`
- **必須**

`ctx.args` のキーとして使用される識別子。

##### `type`

- **型:** `"string" | "number" | "boolean"`
- **必須**

Rune が生のトークンをパースする型。

##### `required`

- **型:** `boolean`
- **デフォルト:** `false`

`true` の場合、引数の指定が必須になります。

##### `default`

- **型:** `type` に対応する型
- **省略可能**

ユーザーが引数を省略した場合に使用される値。

##### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示されるヘルプテキスト。

#### スキーマフィールド

##### `name`

- **型:** `string`
- **必須**

`ctx.args` のキーとして使用される識別子。

##### `schema`

- **型:** `StandardSchemaV1`
- **必須**

バリデーションと変換のための [Standard Schema](https://standardschema.dev) オブジェクト（Zod、Valibot など）。必須/省略可能の意味はスキーマから導出されます。

##### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示されるヘルプテキスト。

### `options`

- **型:** `CommandOptionField[]`
- **省略可能**

`--name` フラグとして宣言されるオプション。

各エントリは**プリミティブフィールド**または**スキーマフィールド**のいずれかで、`args` と同じ基本プロパティに加えて以下の追加プロパティをもちます。プリミティブの boolean オプションは、`required` や `default` を省略しても常にデフォルト値 `false` をもちます。プリミティブの boolean オプションに `default: true` を設定すると、`--no-<name>` フラグが自動生成されます。詳細は[否定形の boolean オプション](#否定形の-boolean-オプション)を参照してください。

#### `short`

- **型:** ASCII 1 文字
- **省略可能**

コマンドの短縮形（例: `--force` -> `-f` の `"f"`）。すべてのオプション間で一意である必要があります。

#### `flag`

- **型:** `true`
- **省略可能**（スキーマフィールドのみ）

設定すると、値なしの真偽値フラグとしてパースされます。フラグが指定された場合はスキーマに `true` が、指定されなかった場合は `undefined` が渡されます。

### `aliases`

- **型:** `readonly string[]`
- **省略可能**

コマンドの別名。各エイリアスは、このコマンドへのルーティングに使用される追加のパスセグメントです。エイリアスは kebab-case のルール（小文字、数字、内部のハイフン）に従う必要があります。ルートコマンドにはエイリアスを設定できません。

### `examples`

- **型:** `readonly string[]`
- **省略可能**

`--help` 出力の `Examples:` セクションに表示される使用例。各エントリはコマンド実行の全体を表わす文字列です。

### `json`

- **型:** `boolean`
- **デフォルト:** `false`

`true` の場合、フレームワークは組み込みの `--json` フラグを受け付けます。JSON モードでは、`run()` の戻り値が構造化された JSON 出力となり、`output.log()` の呼び出しは抑制されます。

### `run`

- **型:** `(ctx: CommandContext) => void | Promise<void>`（`json` が `false` または省略された場合）または `(ctx: CommandContext) => unknown`（`json` が `true` の場合）
- **必須**

コマンドが実行されたときに呼び出される関数。`json` が `true` の場合、戻り値はコマンドの API の一部となり、ユーザーが `--json` を渡した際に JSON 出力としてシリアライズされます。

## CommandContext

`run` 関数は以下のプロパティをもつ `CommandContext` オブジェクトを受け取ります:

### `args`

- **型:** `object`

フィールド名をキーとする、パース済みの位置引数の値。

### `options`

- **型:** `object`

フィールド名をキーとする、パース済みのオプションの値。

### `cwd`

- **型:** `string`

CLI が実行されたワーキングディレクトリ。

### `rawArgs`

- **型:** `readonly string[]`

Rune が `args` と `options` に分割する前の未パースの argv トークン。子プロセスへの転送に便利です。

### `output`

- **型:** `CommandOutput`

フレームワークの出力 API。stdout には `output.log()`、stderr には `output.error()` を使用します。

## kebab-case のフィールド名

ハイフンを含む名前のフィールド（例: `dry-run`）は、`ctx.args` および `ctx.options` オブジェクト上でもとの名前と camelCase 形式（`dryRun`）の両方でアクセスできます。これは型レベルで保証されます。

## 否定形の boolean オプション

プリミティブの boolean オプションに `default: true` を設定すると、Rune は `--no-<name>` フラグを自動生成し、値を `false` に設定できるようにします。

```ts
export default defineCommand({
  options: [{ name: "color", type: "boolean", default: true }],
  run({ options }) {
    console.log(options.color); // デフォルトは true、--no-color で false
  },
});
```

`--help` 出力には両方の形式が表示されます:

```
Options:
  --color, --no-color
  -h, --help           Show help
```

`--<name>` と `--no-<name>` を同時に指定するとエラーになります。また、生成されるネゲーション名と衝突するオプション（例: `color` が否定形をもつ場合に `no-color` という名前のオプション）を定義することもできません。

この機能は `default: true` を明示的に設定したプリミティブの boolean オプションにのみ適用されます。スキーマフィールドは定義時にデフォルト値を判定できないため対象外です。
