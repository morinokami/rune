---
title: defineConfig()
description: defineConfig 関数の API リファレンス。
---

`defineConfig()` はプロジェクト単位の Rune 設定を作成します。返却されるオブジェクトは、プロジェクトルートの `rune.config.ts` のデフォルトエクスポートとして配置します。

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  name: "my-cli",
  version: "1.0.0",
  options: [{ name: "profile", type: "string", default: "prod" }],
  help(data) {
    return `${data.cliName}\n\n${renderDefaultHelp(data)}`;
  },
});
```

## プロパティ

### `name`

- **型:** `string`
- **省略可能**

ヘルプ出力、`--version` 出力、JSON ヘルプのメタデータで使われる CLI 表示名です。

省略した場合、Rune は `package.json` から名前を導出します:

1. `bin` がオブジェクトの場合、ソートされた最初のキー
2. scope を除いた package `name`
3. プロジェクトディレクトリ名

### `version`

- **型:** `string`
- **省略可能**

ヘルプ出力、`--version` 出力、JSON ヘルプのメタデータで使われる CLI 表示バージョンです。

省略した場合、Rune は利用可能であれば `package.json` の `version` フィールドを使います。`defineConfig({ version })` は `package.json` を更新しません。両方を設定する場合は、リリースワークフロー側で同期してください。

### `help`

- **型:** `(data: HelpData) => string`
- **省略可能**

コマンドヘルプ、グループヘルプ、コマンドが見つからない場合のヘルプに適用される、プロジェクト全体のヘルプレンダラーです。

`data` 引数は `HelpData` union です:

- `GroupHelpData`
- `CommandHelpData`
- `UnknownCommandHelpData`

現在のケースは `data.kind` で分岐できます。

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  name: "my-cli",
  help(data) {
    if (data.kind === "unknown") {
      return renderDefaultHelp(data);
    }

    return `${data.cliName}\n\n${renderDefaultHelp(data)}`;
  },
});
```

### `options`

- **型:** `CommandOptionField[]`
- **省略可能**

すべての実行可能コマンドで利用できるグローバルオプションです。[`defineCommand({ options })`](/ja/reference/define-command/) と同じフィールド形式を使えます。

```ts
import { defineConfig } from "@rune-cli/rune";
import { z } from "zod";

export default defineConfig({
  options: [
    { name: "profile", type: "string", env: "APP_PROFILE", default: "prod" },
    { name: "region", schema: z.enum(["ap-northeast-1", "us-east-1"]).optional() },
  ],
});
```

グローバルオプションは、Rune が実行可能コマンドを解決したあとにパースされます:

```sh
my-cli deploy --profile dev
```

実行可能コマンドのヘルプには表示されますが、サブコマンドへの振り分けだけをおこなうグループのヘルプには表示されません。グローバルオプションは省略可能でなければならず、`required: true` や `undefined` を拒否するスキーマはサポートされません。

グローバルオプションでも、コマンドオプションと同じ `env` フォールバックを使用できます。CLI で指定された値が環境変数の値より優先され、環境変数の値はデフォルト値より優先されます。

`rune.config.ts` を変更したら、`rune sync` を実行してエディタの型推論用 `.rune/global-options.d.ts` を更新できます。`rune run` は実行前に同ファイルの再生成を、`rune build` はビルド前に再生成と衝突検証を自動実行します。

### `hooks`

- **型:** `RuneHooks`
- **省略可能**

すべての実行可能コマンドについて、`run()` の前後に実行するフックをプロジェクト全体で登録できます。

```ts
import { defineConfig } from "@rune-cli/rune";

export default defineConfig({
  hooks: {
    beforeRun(ctx) {
      ctx.output.error(`running ${ctx.command.path.join(" ")}`);
    },
    afterRun(ctx) {
      ctx.output.error(`completed ${ctx.command.path.join(" ")}`);
    },
    onRunError(ctx) {
      ctx.output.error(`${ctx.stage} failed: ${ctx.error.message}`);
    },
  },
});
```

これらのフックは、Rune が実行対象のコマンドを決定し、引数の解析に成功したあとに実行されます。`--help`、`--version`、存在しないコマンド、サブコマンドの一覧を表示するだけのグループ、JSON 形式のヘルプ、引数の解析・検証に失敗した場合には実行されません。

各フックに渡される `ctx` には、解析済みの `args`、解析済みの `options`、`cwd`、`rawArgs`、`output`、`stdin`、コマンド情報、`outputMode` が含まれます。`outputMode` は、その実行で標準出力をどの形式として扱うかを表わし、`"text"`、`"json"`、`"jsonl"` のいずれかです。`ctx.options` にはグローバルオプションとコマンド自身のオプションが含まれますが、Rune が追加する `json` フラグは含まれません。JSON 出力として動いているかどうかは `outputMode` を参照してください。

フックから診断メッセージを出す場合は、`output.error()` の使用を推奨します。`output.log()` は通常のテキスト出力のコマンドでは標準出力に書き込むため、コマンド本来の出力を変えてしまう可能性があります。

`afterRun` は `result` を受け取ります。通常のテキスト出力のコマンドでは `{ kind: "text" }`、`json: true` のコマンドでは実際に JSON 出力が有効でない場合でも `{ kind: "json", data }`、`jsonl: true` のコマンドではすべてのレコードを書き出したあとに `{ kind: "jsonl", records }` を受け取ります。

`beforeRun`、コマンドの `run()`、`afterRun` のいずれかでエラーが発生した場合、Rune は `stage` に `"beforeRun"`、`"run"`、`"afterRun"` のいずれかを設定して `onRunError` を呼びます。`onRunError` 自身でもエラーが発生した場合、Rune は `rune/hook-failed` を報告し、最初のエラーと `onRunError` のエラーの両方を詳細情報に保持します。`rune/hook-failed` の終了コードは `onRunError` 側のエラーに由来し、入れ子になった各エラーは詳細情報の中にもとの `exitCode` を保持します。

## 挙動

### メタデータの解決

`defineConfig()` の `name` と `version` は、`package.json` から導出されるメタデータを上書きします。

`rune.config.ts` の読み込みに失敗した場合や、有効な `defineConfig()` の結果がデフォルトエクスポートされていない場合、Rune は `package.json` 由来のメタデータにフォールバックします。

### 優先順位

グローバルな `help` は、マッチしたコマンドが [`defineCommand()`](/ja/reference/define-command/) で独自の `help` 関数を定義していない場合にのみ使われます。

優先順位:

1. `defineCommand({ help })`
2. `defineConfig({ help })`
3. Rune の組み込みデフォルトヘルプレンダラー

### 失敗時の扱い

`rune.config.ts` の読み込みに失敗した場合、`defineConfig()` の返り値がデフォルトエクスポートされていない場合、または `help()` が例外を投げた場合、Rune はデフォルトのヘルプレンダラーにフォールバックし、stderr に警告を書き出します。

これにより、カスタムレンダラーが壊れていても `--help` 自体は利用できます。
