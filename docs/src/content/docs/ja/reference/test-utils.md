---
title: テストユーティリティ
description: Rune のテストユーティリティの API リファレンス。
---

Rune は、子プロセスを起動せずにコマンドをインプロセスでテストするための `runCommand()` を提供しています。`@rune-cli/rune/test` からインポートしてください。

```ts
import { runCommand } from "@rune-cli/rune/test";
import { expect, test } from "vitest";

import greeting from "../src/commands/index.ts";

test("greets by name", async () => {
  const result = await runCommand(greeting, ["world"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("Hello, world!\n");
});
```

## `runCommand()`

Rune のパース・実行パイプラインを通じてコマンドを実行します。入力は CLI トークンの `string[]` として渡されるため、argv パース、型変換、スキーマバリデーション、デフォルト値の処理がすべて実際の呼び出しと同様に動作します。

```ts
function runCommand(
  command: DefinedCommand,
  argv?: string[],
  context?: RunCommandContext,
): Promise<CommandExecutionResult<TCommandData>>
```

`TCommandData` は渡した command から推論されます。`json: true` の command では `run()` の戻り値型、通常の command では `undefined` です。

### パラメータ

#### `command`

- **型:** `DefinedCommand`
- **必須**

`defineCommand()` で作成されたコマンド。

#### `argv`

- **型:** `string[]`
- **デフォルト:** `[]`

コマンドに転送される CLI トークン。

#### `context`

- **型:** `RunCommandContext`
- **デフォルト:** `{}`

省略可能な実行コンテキスト。

### RunCommandContext

#### `cwd`

- **型:** `string`
- **省略可能**

`ctx.cwd` に注入されるワーキングディレクトリの値。`process.cwd()` は変更しません。

### CommandExecutionResult

#### `exitCode`

- **型:** `number`

プロセスの終了コード（成功時は `0`）。

#### `stdout`

- **型:** `string`

キャプチャされた stdout 出力。

#### `stderr`

- **型:** `string`

キャプチャされた stderr 出力。

#### `error`

- **型:** `CommandFailure | undefined`

コマンドが失敗した場合の構造化されたエラー情報。

#### `data`

- **型:** `TCommandData | undefined`

コマンドが `json: true` を使用している場合の `run()` の戻り値です。`TCommandData` は渡した command の `run()` の戻り値型から推論されます。`--json` フラグの有無にかかわらず格納されます。`--json` が制御するのは主に `output.log()` の抑制であり、`data` のキャプチャには影響しません。

## 使用例

### バリデーションエラーのテスト

```ts
test("requires an id argument", async () => {
  const result = await runCommand(command, []);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).not.toBe("");
});
```

### デフォルト値のテスト

```ts
const command = defineCommand({
  options: [{ name: "count", type: "number", default: 1 }],
  run({ options, output }) {
    output.log(`count=${options.count}`);
  },
});

test("uses default count", async () => {
  const result = await runCommand(command, []);

  expect(result.stdout).toBe("count=1\n");
});
```

### JSON モードのテスト

```ts
const command = defineCommand({
  json: true,
  run() {
    return { items: [1, 2, 3] };
  },
});

test("returns structured data", async () => {
  const result = await runCommand(command, ["--json"]);

  expect(result.data).toEqual({ items: [1, 2, 3] });
  expect(result.stdout).toBe("");
});
```
