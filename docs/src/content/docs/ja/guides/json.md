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

`json` を設定しないコマンドの `run()` は `void` を返す関数として型付けされますが、`json: true` を設定すると `run()` は値を返せるようになり、その戻り値型は `runCommand().output.document` などに保持されます。戻り値は `JSON.stringify()` でシリアライズ可能な値である必要があります。`BigInt` などシリアライズできない値を返した場合、Rune はエラーとして処理します。

`json: true` のコマンドでは、`run()` 内で `options.json` も受け取れます。この値は現在の実行において JSON モードが有効かどうかを表わします。ユーザーが `--json` を渡した場合と、AI エージェント実行時に Rune が自動的に JSON モードを有効化した場合に `true` になり、それ以外では `false` です。ユーザーが明示的にフラグを渡したかどうかを確認したい場合は `rawArgs` を参照してください。

## 出力の振る舞い

ユーザーが `--json` フラグを付けてコマンドを実行すると、`run()` の戻り値がインデントなしの 1 行の JSON ドキュメントとして stdout に出力されます:

```bash
$ your-cli projects list --json
{"projects":[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]}
```

`--json` フラグが渡された場合、`output.log()` による出力は自動的に抑制されます。一方、`output.error()` は引き続き stderr に出力されます。JSON モードでは成功・失敗を問わず stdout には常に 1 つの JSON ドキュメントだけが出力されるため、`jq` などのツールやプログラムから stdout をそのまま利用できます。

`--json` フラグなしで実行した場合は、`output.log()` が通常通り出力されます。`run()` の戻り値は表示されません。そのため、人間向けとエージェント向けの両方の出力をひとつのコマンドで提供できます:

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
      output.log(`${p.id}: ${p.name}`);
    }

    // --json の場合に JSON として出力される
    return { projects };
  },
});
```

JSON モードの抑制対象はフレームワークの `output` API のみです。`console.log()` や `process.stdout.write()` で直接書き込まれた出力は抑制されず、JSON ペイロードに混入する原因になります。コマンドの出力には `output.log()` と `output.error()` を使用してください。

## AI エージェント実行時の自動有効化

`json: true` が設定されたコマンドでは、CLI が AI エージェント（Claude Code、Cursor、Codex など）から呼び出されていることを検知すると、`--json` フラグが明示されていなくても Rune が自動的に JSON モードを有効化します。これにより、人間には読みやすいテキスト出力を、エージェントには構造化された JSON 出力を、単一のコマンドで提供できます。エージェント側が `--json` の存在を知って付与する必要はありません。

### オプトアウト: `RUNE_DISABLE_AUTO_JSON`

`RUNE_DISABLE_AUTO_JSON=1`（または `true`）を設定すると、この自動有効化を抑止できます。設定下では、`--json` が明示的に渡されたときのみ JSON モードが有効になり、人間が実行したときと同じ振る舞いになります。

```bash
RUNE_DISABLE_AUTO_JSON=1 your-cli projects list
```

主な用途は、Rune ベースの CLI を**開発する** AI エージェント自身です。このエスケープハッチがないと、エージェント環境下では常に JSON が返るため、エージェントが検証したい人間向けの `output.log()` 出力を確認できません。この環境変数が制御するのは Rune の JSON モード自動有効化のみで、ツールチェーン内の他のエージェント検知には影響しません。

テストハーネス `runCommand()` は既定でエージェント検知を無効化しているため、本環境変数の影響を受けません。

## `output.log()` が重要な理由

Rune の出力ヘルパーは単なる書き方の好みではありません:

- `output.log()` は人間向けの標準出力を書くための通常の方法です。
- `output.error()` は stderr に書き込み、`--json` でも抑制されません。
- テストでは `runCommand()` がこれらのヘルパー経由の出力をキャプチャできます。
- `json: true` のコマンドでは、`--json` が渡されたときに Rune が `output.log()` を抑制し、stdout を JSON ペイロードのみに保ちます。

`console.log()` や `process.stdout.write()` で直接書き込むと、JSON モードでもその出力を Rune は抑制できません。

`run()` が明示的な値を返さなかった場合（戻り値が `undefined` の場合）、JSON 出力は `null` になります。

:::note
`--json` フラグは `--` ターミネータよりも前でのみ認識されます。`-- --json` のように `--` の後に置かれた場合、通常の引数として扱われます。
:::

## エラー時の出力

JSON モードでコマンドが失敗した場合、エラー情報が `error` オブジェクトとして JSON 形式で stdout に出力されます。これは `run()` 内での失敗だけでなく、必須引数の不足などの引数パースエラーにも適用されます:

```bash
$ your-cli projects list --json
{"error":{"kind":"config/not-found","message":"Config file was not found","hint":"Create rune.config.ts"}}
```

エラーペイロードには以下のフィールドが含まれます:

- `kind`: エラーの種別
- `message`: エラーメッセージ
- `hint`: 解決のためのヒント（[`CommandError`](/ja/reference/command-error/) で指定された場合）
- `details`: 追加の構造化データ（シリアライズ可能な場合のみ）

## JSON Lines 出力

stdout に複数の JSON レコードを 1 行ずつ流すコマンドには `jsonl: true` を使用します。この形式は JSON Lines または NDJSON とも呼ばれます。`json: true` と異なり、フラグで有効化されるモードではなく、そのコマンドは常に JSON Lines を出力します。

```ts
import { defineCommand } from "@rune-cli/rune";

export default defineCommand({
  description: "Stream events",
  jsonl: true,
  async *run() {
    yield { id: "a", status: "ready" };
    yield { id: "b", status: "done" };
  },
});
```

yield された各レコードは、1 行のコンパクトな JSON として出力されます:

```bash
$ your-cli events
{"id":"a","status":"ready"}
{"id":"b","status":"done"}
```

JSON Lines モードでは `output.log()` は常に抑制され、`output.error()` は引き続き stderr に出力されます。`jsonl: true` は `json: true` と併用できず、Rune は `--jsonl` フラグを追加しません。人間向けの表示と JSON Lines ストリームの両方が必要な場合は、stdout の契約が明確になるよう別コマンドに分けることを推奨します。

JSON Lines コマンドがレコードを出力した後に失敗した場合、すでに stdout に書かれたレコードはそのまま有効な JSON Lines として残ります。最後のエラーは compact な JSON error オブジェクトとして stderr に出力されます。ただし stderr には `output.error()` による人間向け診断も混在し得るため、JSON Lines として保証されるのは stdout のみです。

## テスト

JSON モードのコマンドのテスト方法については[テスト](/ja/guides/testing/#json-モードのテスト)ガイドを参照してください。
