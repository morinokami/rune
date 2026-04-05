---
title: JSON 出力
description: Rune のコマンドで JSON 出力を有効にする方法について学ぶ。
---

Rune は、人間のための DX（Developer Experience）とエージェントのための AX（Agent Experience）を両立し、人間とエージェントのどちらも第一級のユーザーとして扱う CLI を作りやすくすることを目指しています。こうした AX の基盤の一つとして、コマンドの実行結果を機械可読な JSON 形式で出力する機能が提供されています。

## JSON モードの有効化

`defineCommand()` で `json: true` を設定すると、そのコマンドで JSON モードが有効になります。JSON モードでは `run()` 関数の戻り値がコマンドの構造化された出力となります:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "List all projects",
  json: true,
  run() {
    const projects = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ];
    return { projects };
  },
});
```

`json` を設定しないコマンドの `run()` は `void` を返す関数として型付けされますが、`json: true` を設定すると `run()` の戻り値の型が `unknown` になり、値を返すことが許可されます。戻り値は `JSON.stringify()` でシリアライズ可能な値である必要があります。`BigInt` などシリアライズできない値を返した場合、Rune はエラーとして処理します。

## 出力の振る舞い

ユーザーが `--json` フラグを付けてコマンドを実行すると、`run()` の戻り値が整形された JSON として stdout に出力されます:

```bash
$ your-cli projects list --json
{
  "projects": [
    {
      "id": 1,
      "name": "alpha"
    },
    {
      "id": 2,
      "name": "beta"
    }
  ]
}
```

`--json` フラグが渡された場合、`output.info()` による出力は自動的に抑制されます。一方、`output.error()` は引き続き stderr に出力されます。JSON モードでは成功・失敗を問わず stdout には常に 1 つの JSON ドキュメントだけが出力されるため、`jq` などのツールやプログラムから stdout をそのまま利用できます。

`--json` フラグなしで実行した場合は、`output.info()` が通常通り出力されます。`run()` の戻り値は表示されません。そのため、人間向けとエージェント向けの両方の出力をひとつのコマンドで提供できます:

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "List all projects",
  json: true,
  run({ output }) {
    const projects = [
      { id: 1, name: "alpha" },
      { id: 2, name: "beta" },
    ];

    // --json なしの場合のみ表示される
    for (const p of projects) {
      output.info(`${p.id}: ${p.name}`);
    }

    // --json の場合に JSON として出力される
    return { projects };
  },
});
```

JSON モードの抑制対象はフレームワークの `output` API のみです。`console.log()` や `process.stdout.write()` で直接書き込まれた出力は抑制されず、JSON ペイロードに混入する原因になります。コマンドの出力には `output.info()` と `output.error()` を使用してください。

`run()` が明示的な値を返さなかった場合（戻り値が `undefined` の場合）、JSON 出力は `null` になります。

:::note
`--json` フラグは `--` ターミネータよりも前でのみ認識されます。`-- --json` のように `--` の後に置かれた場合、通常の引数として扱われます。
:::

## エラー時の出力

JSON モードでコマンドが失敗した場合、エラー情報が `error` オブジェクトとして JSON 形式で stdout に出力されます。これは `run()` 内での失敗だけでなく、必須引数の不足などの引数パースエラーにも適用されます:

```bash
$ your-cli projects list --json
{
  "error": {
    "kind": "config/not-found",
    "message": "Config file was not found",
    "hint": "Create rune.config.ts"
  }
}
```

エラーペイロードには以下のフィールドが含まれます:

- `kind`: エラーの種別
- `message`: エラーメッセージ
- `hint`: 解決のためのヒント（[`CommandError`](/ja/reference/command-error/) で指定された場合）
- `details`: 追加の構造化データ（シリアライズ可能な場合のみ）

## テスト

JSON モードのコマンドのテスト方法については[テスト](/ja/guides/testing/#json-モードのテスト)ガイドを参照してください。
