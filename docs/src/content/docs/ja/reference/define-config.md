---
title: defineConfig()
description: defineConfig 関数の API リファレンス。
---

`defineConfig()` はプロジェクト単位の Rune 設定を作成します。返却されるオブジェクトは、プロジェクトルートの `rune.config.ts` のデフォルトエクスポートとして配置します。

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    return `My CLI\n\n${renderDefaultHelp(data)}`;
  },
});
```

## プロパティ

### `help`

- **型:** `(data: HelpData) => string`
- **省略可能**

コマンドヘルプ、グループヘルプ、未知のコマンド時のヘルプに適用される、プロジェクト全体のヘルプレンダラーです。

`data` 引数は `HelpData` union です:

- `GroupHelpData`
- `CommandHelpData`
- `UnknownCommandHelpData`

現在のケースは `data.kind` で分岐できます。

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    if (data.kind === "unknown") {
      return renderDefaultHelp(data);
    }

    return `My CLI\n\n${renderDefaultHelp(data)}`;
  },
});
```

## 挙動

### 優先順位

グローバルな `help` は、マッチしたコマンドが [`defineCommand()`](/ja/reference/define-command/) で独自の `help` 関数を定義していない場合にのみ使われます。

優先順位:

1. `defineCommand({ help })`
2. `defineConfig({ help })`
3. Rune の組み込みデフォルトヘルプレンダラー

### 失敗時の扱い

`rune.config.ts` の読み込みに失敗した場合、`defineConfig()` の返り値がデフォルトエクスポートされていない場合、または `help()` が例外を投げた場合、Rune はデフォルトのヘルプレンダラーにフォールバックし、stderr に警告を書き出します。

これにより、カスタムレンダラーが壊れていても `--help` 自体は利用できます。
