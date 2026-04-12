---
title: CommandError
description: CommandError クラスの API リファレンス。
---

`CommandError` は、構造化された情報を伴うコマンドの失敗を通知するためのエラークラスです。コマンドの `run` 関数内でスローされると、Rune がキャッチして適切にフォーマットします。`--json` 使用時には構造化された JSON 出力もおこないます。

```ts
import { defineCommand, CommandError } from "@rune-cli/rune";

export default defineCommand({
  args: [{ name: "id", type: "string", required: true }],
  run({ args }) {
    throw new CommandError({
      kind: "not-found",
      message: `Project "${args.id}" not found`,
      hint: "Run 'my-cli project list' to see available projects",
    });
  },
});
```

## コンストラクタ

```ts
new CommandError(init: CommandErrorInit)
```

### CommandErrorInit

#### `kind`

- **型:** `string`
- **必須**

プログラム的な利用者に向けてエラーを分類する文字列。`--json` モードではこの値が出力に含まれるため、呼び出し側はメッセージを解析せずに特定のエラー種別を判別できます。`"not-found"`、`"already-exists"`、`"validation"` のような安定した識別子を選んでください。`rune/*` 名前空間はフレームワークが生成する失敗に予約されています。

#### `message`

- **型:** `string`
- **必須**

人間向けのエラーメッセージ。

#### `hint`

- **型:** `string`
- **省略可能**

エラーの解決方法を示す提案。

#### `details`

- **型:** `JsonValue`
- **省略可能**

JSON 出力に含まれる任意の構造化データ。

#### `exitCode`

- **型:** `number`
- **デフォルト:** `1`

プロセスの終了コード。

#### `cause`

- **型:** `unknown`
- **省略可能**

根本原因のエラー。ネイティブの `Error` コンストラクタに渡されます。

## CommandFailure

`CommandFailure` は `CommandError` のシリアライズされた形式で、テスト結果（例: `runCommand().error`）で使用されます。なお、`--json` モードで stdout に書き出される JSON エラー出力は異なる形式（`{ error: { kind, message, hint?, details? } }`）であり、`exitCode` は含まれません。

```ts
interface CommandFailure {
  readonly kind: string;
  readonly message: string;
  readonly hint?: string;
  readonly details?: JsonValue;
  readonly exitCode: number;
}
```
