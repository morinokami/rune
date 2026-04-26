---
title: Standard Schema
description: Rune のコマンドで Standard Schema によるバリデーションと変換を利用する方法について学ぶ。
---

Rune のオプションや引数は、`type` プロパティで指定するプリミティブ型（`"string" | "number" | "boolean"`）と組み込みの enum 型（`type: "enum"` と `values`）に加えて、`schema` プロパティで [Standard Schema](https://standardschema.dev) に準拠した任意のスキーマを指定できます。これにより、Zod や Valibot などのスキーマライブラリをそのまま活用して、単純な型チェックを超えたバリデーションと変換をオプション・引数に適用できます。

## プリミティブ型との使い分け

`type` と `schema` は同じフィールドに対していずれか一方のみを使用できます。どちらを選ぶかは、そのオプション・引数に必要な検証・変換のレベルによって決まります。

| やりたいこと | 使うもの |
|---|---|
| 単純な文字列・数値・真偽値の受け取りで十分 | `type: "string" \| "number" \| "boolean"` |
| 固定された文字列／数値の選択肢に制限したい | `type: "enum"` と `values` |
| フォーマット検証（UUID、メールアドレスなど）をおこないたい | `schema` |
| 値の範囲制約（最小・最大など）を課したい | `schema` |
| 文字列を特定の型に変換（`z.coerce.number()` など）したい | `schema` |
| 列挙値に対して追加のバリデーションや変換をおこないたい | `schema` |

プリミティブ型や enum 型は宣言が簡潔で、`--help` 出力にも `<string>` や `<dev|prod>` のような型ヒントとデフォルト値が自動で表示されます。一方、Standard Schema はライブラリの表現力をそのまま使えますが、ヘルプ表示は後述の `typeLabel` / `defaultLabel` で補う必要があります。

## 基本的な使い方

### Zod

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  description: "Fetch a resource by id",
  options: [
    {
      name: "retries",
      schema: z.coerce.number().int().min(0).max(10),
      description: "Number of retry attempts",
    },
  ],
  args: [
    {
      name: "id",
      schema: z.uuid(),
      description: "Resource id (UUID)",
    },
  ],
  run({ options, args }) {
    // options.retries は number（0〜10 の整数に検証・変換済み）
    // args.id は string（UUID 形式として検証済み）
  },
});
```

### Valibot

```ts
import { defineCommand } from "@rune-cli/rune";
import * as v from "valibot";

export default defineCommand({
  args: [
    {
      name: "mode",
      schema: v.picklist(["dev", "prod"]),
    },
  ],
  run({ args }) {
    // args.mode は "dev" | "prod"
  },
});
```

`ctx.args` や `ctx.options` の値の型は、スキーマの出力型から自動的に推論されます。

## 必須・省略可能とデフォルト値

プリミティブ型では `required` や `default` プロパティで必須/省略可能を宣言しますが、スキーマフィールドではこれらを指定しません。代わりに、スキーマ自体の定義から必須/省略可能が決まります。

スキーマが `undefined` を受け入れるかどうかで必須/省略可能が決まります。`z.string().optional()` や `z.string().default("dev")` のように `undefined` を受け付けるスキーマは省略可能として、それ以外は必須として扱われます。

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    // 必須: undefined を受け付けないため、省略するとエラー
    { name: "id", schema: z.uuid() },

    // 省略可能: undefined が許容される
    { name: "label", schema: z.string().optional() },

    // 省略可能 + デフォルト値: 省略時にスキーマが "dev" を返す
    { name: "mode", schema: z.string().default("dev") },
  ],
  run() {
    // ...
  },
});
```

スキーマ側で `default()` を指定した場合、ユーザーがそのオプションを省略すると、スキーマが返すデフォルト値がそのまま `ctx.options` に入ります。

## 真偽値フラグとしてのオプション

Standard Schema で定義したオプションを値なしの真偽値フラグとして扱うには、`flag: true` を指定します。フラグが指定された場合はスキーマに `true` が、指定されなかった場合は `undefined` が渡されます。

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    {
      name: "force",
      schema: z.boolean().optional(),
      flag: true,
      short: "f",
    },
  ],
  run({ options }) {
    // options.force は boolean | undefined
  },
});
```

`flag: true` が必要なのは、スキーマの内部構造から「このオプションが値を取るのか、値なしのフラグなのか」を Rune が判別できないためです。プリミティブ型では `type: "boolean"` がそのヒントになりますが、スキーマフィールドでは明示的な指定が必要になります。

`flag: true` の有無によって、引数のパース結果は次のように変わります:

```bash
# flag: true なし（値を取るオプションとして扱われる）
$ my-cli --force value   # options.force = "value" がスキーマに渡される
$ my-cli --force         # エラー: 値が必要

# flag: true あり（値なしのフラグとして扱われる）
$ my-cli --force         # options.force = true がスキーマに渡される
$ my-cli --force value   # "value" は次の位置引数として扱われる
```

`flag: true` を指定したスキーマオプションに対しては、プリミティブの真偽値オプションとは異なり、`--no-<name>` の自動生成はおこなわれません。否定形が必要な場合は、別オプションとして明示的に定義してください。

## `typeLabel` と `defaultLabel` によるヘルプ表示

Standard Schema にはスキーマの型やデフォルト値を外部から取り出すための API がないため、`--help` 出力にこれらを自動で表示することはできません。読み手に意図を伝えたい場合は、スキーマフィールドに表示専用の `typeLabel` と `defaultLabel` を指定します。

```ts
import { defineCommand } from "@rune-cli/rune";
import { z } from "zod";

export default defineCommand({
  options: [
    {
      name: "port",
      schema: z.coerce.number().int().positive().default(3000),
      typeLabel: "number",
      defaultLabel: "3000",
      description: "Port to listen on",
    },
  ],
  run() {
    // ...
  },
});
```

`--help` 出力は次のようになります:

```
Options:
  --port <number>  Port to listen on (default: 3000)
  -h, --help       Show help
```

`typeLabel` と `defaultLabel` はいずれも表示専用であり、バリデーションや型推論、必須/省略可能の判定には一切影響しません。`defaultLabel` を指定しても、実際にデフォルト値を供給するのはスキーマ側です。ラベルとスキーマ側の定義がずれないよう、両方を更新する際はセットで見直してください。

## エラー時の動作

スキーマの検証に失敗した場合、Rune はそのフィールドの検証エラーを引数パースエラーとしてまとめ、コマンド実行前にエラーメッセージを出力して終了します。メッセージは、スキーマが返す `issues` の `message` を改行で連結したものになります。

```bash
$ my-cli fetch not-a-uuid
Error: Invalid uuid
```

JSON モード（`json: true` のコマンドで `--json` を指定した場合）では、パースエラーも `error` オブジェクトとして stdout に JSON 形式で出力されます。詳細は [JSON 出力](/ja/guides/json/#エラー時の出力)ガイドを参照してください。
