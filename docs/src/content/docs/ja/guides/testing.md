---
title: テスト
description: Rune のコマンドをテストする方法について学ぶ。
---

Rune はコマンドをインプロセスでテストするための `runCommand()` 関数を提供しています。`runCommand()` は、解決済みコマンドそのものに対してユーザーが入力するのと同じ CLI トークンを受け取ります。`runCommand()` はテストランナーに依存しないため、Vitest や Jest、Node.js の組み込みテストランナーなど、任意のテストフレームワークと組み合わせて使用できます。`runCommand()` を使用するには、`@rune-cli/rune/test` からインポートします。

:::note
このガイドでは、テストフレームワークとして [Vitest](https://vitest.dev/) を使用しています。
:::

テストは `tests/` ディレクトリに置いても、コマンドファイルの横にコロケーションしてもかまいません。`src/commands` 以下の `.test.ts` または `.spec.ts` で終わるファイルは、Rune のコマンドルーティングでは無視されます。

## runCommand の仕組み

`runCommand()` は、入力として `string[]` 形式の CLI トークンを受け取ります。これはユーザーがターミナルで入力するのと同じ形式です。内部では単一のコマンドに対して Rune のコマンドレベルのパース・実行パイプラインが走るため、argv のパース、型変換、バリデーション、デフォルト値の処理といった一連の動作が、実際の CLI 実行時と同じように行われます。なお、コマンドルーティングやヘルプ表示などのトップレベルの CLI 動作は含まれません。`runCommand()` が対象とするのは、解決済みの個別コマンドのみです。

子プロセスを起動しないため高速に動作し、実行結果は `CommandExecutionResult` オブジェクトとして返されます:

- `exitCode`: 終了コード（成功時は `0`）
- `stdout`: 標準出力にキャプチャされた文字列
- `stderr`: 標準エラー出力にキャプチャされた文字列
- `error`: コマンドが失敗した場合の構造化されたエラー情報
- `output`: 出力データを表す discriminated union（`text`、`json`、または `jsonl`）

## 基本的なテスト

`runCommand()` は `defineCommand()` で作成したコマンドを受け取り、指定された引数で実行します。テストしたいコマンドをインポートし、第 1 引数として渡してください。

たとえば、[コマンド](/ja/guides/commands/)ガイドで作成した greeting コマンドは次のようにテストできます:

```ts
import { expect, test } from "vitest";
import { runCommand } from "@rune-cli/rune/test";

import greeting from "../src/commands/index.ts";

test("greets by name", async () => {
  const result = await runCommand(greeting, ["world"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("Hello, world!\n");
});
```

オプションや引数は、実際の CLI と同じ文字列配列として渡します:

```ts
test("greets loudly with --loud flag", async () => {
  const result = await runCommand(greeting, ["world", "--loud"]);

  expect(result.stdout).toBe("HELLO, WORLD!\n");
});
```

## エラーのテスト

コマンド内で [`CommandError`](/ja/reference/command-error/) を throw すると、`runCommand()` はそのエラー情報を `result.error` として返します:

```ts
import { expect, test } from "vitest";
import { defineCommand, CommandError } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  run() {
    throw new CommandError({
      kind: "config/not-found",
      message: "Config file was not found",
      hint: "Create rune.config.ts",
      exitCode: 7,
    });
  },
});

test("returns structured error", async () => {
  const result = await runCommand(command);

  expect(result.exitCode).toBe(7);
  expect(result.error).toEqual({
    kind: "config/not-found",
    message: "Config file was not found",
    hint: "Create rune.config.ts",
    exitCode: 7,
  });
});
```

予期しない例外が throw された場合は、`kind: "rune/unexpected"` としてラップされます。

## JSON モードのテスト

`json: true` が設定されたコマンドでは、`run()` の戻り値が `result.output.document` に格納されます。`--json` フラグを渡すと `output.log()` による出力が抑制され、`output.error()` は引き続き出力されます:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  json: true,
  run({ output }) {
    output.log("this is suppressed with --json");
    return { items: [1, 2, 3] };
  },
});

test("returns structured document", async () => {
  const result = await runCommand(command, ["--json"]);

  expect(result.stdout).toBe("");
  expect(result.output).toEqual({
    kind: "json",
    document: { items: [1, 2, 3] },
  });
});
```

`--json` フラグを渡さない場合でも `result.output.document` は取得できます。`--json` フラグは `output.log()` の出力を制御するものであり、document のキャプチャには影響しません。

## コンテキストの注入

`runCommand()` の第 3 引数にコンテキストを渡すことで、コマンドが参照する `ctx.cwd` を差し替えることができます。これは `process.cwd()` を変更せずにテスト固有の作業ディレクトリを注入する手段です:

```ts
import { expect, test } from "vitest";
import { defineCommand } from "@rune-cli/rune";
import { runCommand } from "@rune-cli/rune/test";

const command = defineCommand({
  run({ cwd, output }) {
    output.log(cwd);
  },
});

test("injects custom cwd", async () => {
  const result = await runCommand(command, [], { cwd: "/tmp/test-project" });

  expect(result.stdout).toBe("/tmp/test-project\n");
});
```

`env` を宣言したオプションをテストするために、環境変数の値を注入することもできます。渡した環境変数のマップはテスト対象コマンドにおける `process.env` の代わりに使われ、自動的にはマージされません。デフォルトでは空の環境変数マップが使われるため、テストはホスト環境から切り離されます。

```ts
const command = defineCommand({
  options: [{ name: "port", type: "number", env: "PORT", default: 3000 }],
  run({ options, output }) {
    output.log(String(options.port));
  },
});

test("uses injected env", async () => {
  const result = await runCommand(command, [], { env: { PORT: "4000" } });

  expect(result.stdout).toBe("4000\n");
});
```

現在のプロセス環境を保ったまま 1 つの値だけ追加したい場合は、`process.env` を明示的に展開してください:

```ts
test("inherits host env explicitly", async () => {
  const result = await runCommand(command, [], {
    env: { ...process.env, PORT: "4000" },
  });

  expect(result.stdout).toBe("4000\n");
});
```

stdin も注入可能です。`ctx.stdin` を読むコマンドも、子プロセスを起動せずに隔離された状態でテストできます:

```ts
const command = defineCommand({
  async run({ stdin, output }) {
    const input = stdin.isPiped ? await stdin.text() : "";
    output.log(input.trim());
  },
});

test("reads injected stdin", async () => {
  const result = await runCommand(command, [], { stdin: "hello\n" });

  expect(result.stdout).toBe("hello\n");
});
```

## グローバルオプションを使うテスト

プロジェクトで `defineConfig({ options })` を定義している場合は、プロジェクト設定を組み込んだヘルパーを一度作成し、`runCommand()` と同じように使います:

```ts
import { expect, test } from "vitest";
import { createRunCommand } from "@rune-cli/rune/test";

import config from "../rune.config";
import deploy from "../src/commands/deploy";

const runCommand = createRunCommand(config);

test("uses the configured profile", async () => {
  const result = await runCommand(deploy, ["--profile", "dev"]);

  expect(result.exitCode).toBe(0);
});
```

これにより、各テストでグローバルオプションを繰り返し指定せずに、実際の CLI と同じパース・バリデーション経路でコマンドをテストできます。

API の詳細については[テストユーティリティのリファレンス](/ja/reference/test-utils/)を参照してください。
