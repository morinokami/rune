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

すべての実行可能コマンドで利用できるグローバルオプションです。[`defineCommand({ options })`](/ja/reference/define-command/) と同じ field 形式を使えます。

```ts
import { defineConfig } from "@rune-cli/rune";
import { z } from "zod";

export default defineConfig({
  options: [
    { name: "profile", type: "string", default: "prod" },
    { name: "region", schema: z.enum(["ap-northeast-1", "us-east-1"]).optional() },
  ],
});
```

グローバルオプションは、Rune が実行可能コマンドを解決したあとにパースされます:

```sh
my-cli deploy --profile dev
```

実行可能コマンドのヘルプには表示されますが、サブコマンドへの振り分けだけをおこなうグループのヘルプには表示されません。グローバルオプションは省略可能でなければならず、`required: true` や `undefined` を拒否するスキーマはサポートされません。

`rune.config.ts` を変更したら、`rune sync` を実行してエディタの型推論用 `.rune/global-options.d.ts` を更新できます。`rune run` は実行前に同ファイルの再生成を、`rune build` はビルド前に再生成と衝突検証を自動実行します。

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
