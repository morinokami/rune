---
title: defineCommand()
description: defineCommand 関数の API リファレンス。
---

`defineCommand()` は CLI コマンドを作成します。返却されるオブジェクトはファイルのデフォルトエクスポートとする必要があります。

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Create a new project",
  options: [{ name: "force", type: "boolean", short: "f" }],
  args: [{ name: "name", type: "string", required: true }],
  run({ options, args }) {
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

各エントリは**プリミティブフィールド**、**enum フィールド**、**スキーマフィールド**のいずれかです。フィールドはプリミティブ型の `type`、`type: "enum"` と `values` の組み合わせ、または `schema` のいずれか 1 つだけを使用します。これらを混在させることはできません。

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

- **型:** `true`
- **省略可能**

設定すると、引数の指定が必須になります。省略した場合は任意フィールドのままです。

##### `default`

- **型:** `type` に対応する型
- **省略可能**

ユーザーが引数を省略した場合に使用される値です。プリミティブのデフォルト値は `--help` に表示されます。

##### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示されるヘルプテキスト。

#### enum フィールド

##### `name`

- **型:** `string`
- **必須**

`ctx.args` のキーとして使用される識別子。

##### `type`

- **型:** `"enum"`
- **必須**

##### `values`

- **型:** `readonly (string | number)[]`
- **必須**

許可される値。CLI の生トークンは各エントリに対して文字列比較（`String(value) === rawToken`）で照合されます。そのため `values: [1, 2]` は `"1"` や `"2"` を受け付けますが、`"007"` や `"1.0"` は受け付けません。文字列の値は `/^[A-Za-z0-9_.-]+$/`（英数字、`_`、`.`、`-`）に一致する必要があり、スペースやその他の特殊文字を含む値は定義時に拒否されます。空文字列、`NaN`、`Infinity`、および文字列化後の重複も同様に定義時に拒否されます。

##### `required`

- **型:** `true`
- **省略可能**

設定すると、このフィールドはユーザーによる指定が必須になります。省略した場合は任意フィールドのままです。

##### `default`

- **型:** `values` のいずれかの値
- **省略可能**

ユーザーがフィールドを省略した際に使用される値。`values` に含まれている必要があります。

##### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示されるヘルプテキスト。許可された値は名前と並べて `<a|b|c>` の形式で表示されます。

#### スキーマフィールド

##### `name`

- **型:** `string`
- **必須**

`ctx.args` のキーとして使用される識別子。

##### `schema`

- **型:** `StandardSchemaV1`
- **必須**

バリデーションと変換のための [Standard Schema](https://standardschema.dev) オブジェクト（Zod、Valibot など）。必須/省略可能の意味はスキーマから導出されます。

##### `typeLabel`

- **型:** `string`
- **省略可能**

`--help` 出力で `<typeLabel>` として表示される、表示専用の型ヒント（例: `"uuid"`、`"number"`）。バリデーションや型推論には影響しません。スキーマが受け付ける値のかたちを読者に伝える必要があるときに使用します。

##### `defaultLabel`

- **型:** `string`
- **省略可能**

`--help` 出力で `(default: defaultLabel)` として表示される、表示専用のデフォルト値ラベル。必須/省略可能の判定には影響せず、その判定は従来どおりスキーマ自体から導出されます。スキーマ側にデフォルト値を設定している場合は、内容を同期させてください。

##### `description`

- **型:** `string`
- **省略可能**

`--help` 出力に表示されるヘルプテキスト。

### `options`

- **型:** `CommandOptionField[]`
- **省略可能**

`--name` フラグとして宣言されるオプション。

各エントリは**プリミティブフィールド**、**enum フィールド**、**スキーマフィールド**のいずれかで、`args` と同じ基本プロパティに加えて以下の追加プロパティをもちます。プリミティブのデフォルト値は `--help` に表示されますが、boolean オプションは例外です。プリミティブの boolean オプションは、`required` や `default` を省略しても常にデフォルト値 `false` をもちます。プリミティブの boolean オプションに `default: true` を設定すると、`--no-<name>` フラグが自動生成されます。詳細は[否定形の boolean オプション](#否定形の-boolean-オプション)を参照してください。

オプション名 `"help"` はフレームワークの予約語であり、使用できません。`json: true` を設定した場合は、組み込みの `--json` フラグをフレームワークが管理するため、`"json"` も予約されます。

#### `short`

- **型:** ASCII 1 文字
- **省略可能**

コマンドの短縮形（例: `--force` -> `-f` の `"f"`）。すべてのオプション間で一意である必要があります。短縮名 `"h"` は組み込みの `--help` フラグに予約されているため使用できません。

#### `env`

- **型:** `string`
- **省略可能**（単一値のオプションのみ）

CLI でオプションが指定されなかった場合に、フォールバックとして読む環境変数名です。

```ts
options: [{ name: "port", type: "number", env: "PORT", default: 3000 }];
```

解決順序は **CLI > env > default** です。たとえば `--port 4000` は `PORT=5000` より優先されます。`--port` が省略された場合は `PORT=5000` がオプション値として解析され、CLI と env のどちらも存在しない場合はデフォルト値が使われます。`env` は型推論や必須/省略可能の型には影響しません。

環境変数の値は CLI 値と同じバリデーション経路で解析されます。不正な環境変数の値が存在する場合はデフォルト値にフォールバックせず、コマンドはエラーになります。空文字列は未設定扱いではなく、指定された値として扱われます。

プリミティブの真偽値オプションの環境変数値は `"true"` / `"false"` のみ受け付けます。スキーマの `flag: true` オプションでも環境変数値は `"true"` / `"false"` のみ受け付け、真偽値に変換してからスキーマへ渡します。`multiple: true` オプションでは `env` を使用できません。

環境変数名は `/^[A-Za-z_][A-Za-z0-9_]*$/` に一致する必要があります。デフォルトヘルプでは、たとえば `(default: 3000, env: PORT)` または `(env: PORT)` のように表示されます。

#### `multiple`

- **型:** `true`
- **省略可能**（オプションのみ）

設定すると、そのオプションを複数回指定できるようになります。プリミティブの `"string"` / `"number"` オプションと enum オプションは、指定順の配列としてパースされます:

```ts
options: [
  { name: "tag", type: "string", multiple: true, default: [] },
  { name: "level", type: "number", multiple: true },
];
```

この例では `ctx.options.tag` は `string[]`、`ctx.options.level` は `required` または配列のデフォルト値を設定しない限り `number[] | undefined` になります。enum オプションも同じ規則に従い、各要素は `values` のいずれかに制限されます。

スキーマオプションでは、Rune は収集した生の文字列値を配列としてスキーマに渡します。そのため、配列を受け取るスキーマを使用してください:

```ts
options: [{ name: "tag", schema: z.array(z.string()).default([]), multiple: true }];
```

プリミティブの boolean オプションと、スキーマの `flag: true` オプションでは `multiple: true` を使用できません。

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

- **型:** `true`
- **省略可能**

設定すると、フレームワークは組み込みの `--json` フラグを受け付けます。JSON モードでは、`run()` の戻り値が構造化された JSON 出力となり、`output.log()` の呼び出しは抑制されます。省略した場合は JSON モード無効のままです。

### `help`

- **型:** `(data: CommandHelpData) => string`
- **省略可能**

このコマンド専用のカスタムヘルプレンダラーです。指定した場合、このコマンドの `--help` 出力ではグローバルまたはデフォルトのレンダラーの代わりにこの関数が呼ばれます。

`data` 引数には、そのコマンドに対応する構造化済みの `CommandHelpData` が渡されます。

```ts
import { defineCommand, renderDefaultHelp } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy to production",
  help(data) {
    return `Deploy Command\n\n${renderDefaultHelp(data)}`;
  },
  async run() {
    // ...
  },
});
```

`help()` が例外を投げた場合、Rune はデフォルトのヘルプレンダラーにフォールバックし、stderr に警告を書き出します。

### `run`

- **型:** `(ctx: CommandContext) => void | Promise<void>`（`json` が省略された場合）または `(ctx: CommandContext) => TCommandData | Promise<TCommandData>`（`json` が `true` の場合）
- **必須**

コマンドが実行されたときに呼び出される関数です。`json` が `true` の場合、戻り値はコマンドの API の一部となり、ユーザーが `--json` を渡した際に JSON 出力としてシリアライズされ、`runCommand().data` にも保持されます。

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

それ以外のプリミティブのデフォルト値は、ヘルプ出力にそのまま表示されます。

この機能は `default: true` を明示的に設定したプリミティブの boolean オプションにのみ適用されます。スキーマフィールドは定義時にデフォルト値を判定できないため対象外です。
