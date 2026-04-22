---
title: defineGroup()
description: defineGroup 関数の API リファレンス。
---

`defineGroup()` はコマンドグループのメタデータを定義します。この関数のデフォルトエクスポートを、コマンドディレクトリ内の `_group.ts` ファイルに配置してください。

`_group.ts` はコマンドグループのメタデータを定義するための予約ファイルです。コマンドとしては扱われず、また同じディレクトリ内で `index.ts` と共存することはできません。

```ts
import { defineGroup } from "@rune-cli/rune";

export default defineGroup({
  description: "Manage projects",
});
```

## プロパティ

### `description`

- **型:** `string`
- **必須**

グループが実行されたときに `--help` 出力に表示される一行の説明文。

### `aliases`

- **型:** `readonly string[]`
- **省略可能**

グループの別名。各エイリアスは、このグループへのルーティングに使用される追加のパスセグメントです。エイリアスは kebab-case のルール（小文字、数字、内部のハイフン）に従う必要があります。ルートグループにはエイリアスを設定できません。

### `examples`

- **型:** `readonly string[]`
- **省略可能**

`--help` 出力の `Examples:` セクションに表示される使用例。各エントリはコマンド実行の全体を表わす文字列です。
