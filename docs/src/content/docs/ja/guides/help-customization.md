---
title: ヘルプのカスタマイズ
description: Rune のヘルプ出力をカスタマイズする方法について学ぶ。
---

Rune は、コマンドの `description`、`args`、`options`、`examples` からヘルプを自動的に生成します。生成されるヘルプ出力をより細かく制御したい場合は、`defineCommand({ help })` を使ってコマンド単位でカスタマイズするか、`rune.config.ts` によりプロジェクト全体でカスタマイズすることができます。

## コマンド単位のカスタマイズ

`defineCommand()` の `help` プロパティに関数を渡すと、そのコマンドの `--help` 出力を自由に制御できます。関数には構造化された `CommandHelpData` が渡され、戻り値の文字列がそのまま表示されます:

```ts
// src/commands/deploy.ts
import { defineCommand, renderDefaultHelp } from "@rune-cli/rune";

export default defineCommand({
  description: "Deploy to production",
  options: [
    { name: "target", type: "string", short: "t", description: "Deploy target" },
  ],
  help(data) {
    return `🚀 Deploy Command\n\n${renderDefaultHelp(data)}`;
  },
  async run({ options }) {
    // ...
  },
});
```

```bash
$ my-cli deploy --help
🚀 Deploy Command

Deploy to production

Usage: my-cli deploy [options]

Options:
  -t, --target <string>  Deploy target
  -h, --help  Show help
```

`CommandHelpData` には、コマンド名やパスセグメント、引数・オプション・サブコマンドの定義情報が含まれています。これらを使って、ヘルプをゼロから組み立てることもできます。詳細は [`defineCommand()` のリファレンス](/ja/reference/define-command/#help)を参照してください。

## プロジェクトレベルのカスタマイズ

すべてのコマンドに共通のスタイルを適用するには、プロジェクトルートに `rune.config.ts` を作成し、`defineConfig()` で `help` を定義します:

```ts
// rune.config.ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    return `My CLI v1.0\n\n${renderDefaultHelp(data)}`;
  },
});
```

この設定により、すべてのコマンド、グループ、コマンドが見つからない場合のヘルプ画面の先頭に「My CLI v1.0」が表示されるようになります。

`help` の `data` 引数は `HelpData` union で、`data.kind` によってケースを分岐できます:

```ts
// rune.config.ts
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

`data.kind` は以下の 3 つの値を取ります。これにより、ヘルプの種類に応じて表示を出し分けることができます:

- `"command"`: 個別コマンドのヘルプ
- `"group"`: サブコマンドをもつグループのヘルプ
- `"unknown"`: コマンドが見つからない場合のヘルプ

詳細は [`defineConfig()` のリファレンス](/ja/reference/define-config/)を参照してください。

## 優先順位

ヘルプのレンダリングには 3 段階の優先順位があります:

1. `defineCommand({ help })`: コマンド固有のレンダラー
2. `defineConfig({ help })`: プロジェクト全体のレンダラー
3. Rune の組み込みデフォルトレンダラー

コマンドに `help` が定義されていれば常にそれが使われ、`rune.config.ts` の `help` やデフォルトレンダラーは呼ばれません。`help` が定義されていないコマンドや、グループ、コマンドが見つからない場合には、プロジェクト全体の `help` が適用されます。どちらも定義されていなければ、Rune の組み込みデフォルトレンダラーが使われます。

## `renderDefaultHelp` を活用する

`renderDefaultHelp` は Rune の組み込みデフォルトヘルプ出力を生成する関数で、`@rune-cli/rune` からインポートできます。カスタムレンダラー内でこの関数を呼ぶことで、デフォルトの出力をベースにヘッダーやフッターを追加するといったカスタマイズが簡単にできます:

```ts
import { defineConfig, renderDefaultHelp } from "@rune-cli/rune";

export default defineConfig({
  help(data) {
    const header = "my-tool — A modern build tool\n";
    const footer = "\nDocumentation: https://example.com/docs";
    return `${header}\n${renderDefaultHelp(data)}${footer}\n`;
  },
});
```

デフォルトの出力を一切使わず、`data` のフィールドから完全に独自のフォーマットを組み立てることもできます。

## エラー時のフォールバック

`defineCommand({ help })` や `defineConfig({ help })` で指定した関数が例外を投げた場合、Rune はデフォルトのヘルプレンダラーにフォールバックし、stderr に警告を出力します。同じフォールバックは、`rune.config.ts` の読み込みに失敗した場合や、有効な `defineConfig()` の結果がデフォルトエクスポートされていない場合にも適用されます。これにより、カスタムレンダラーや設定にバグがあっても `--help` 自体は常に利用可能です。

## JSON ヘルプ

`--help` と一緒に `--json` を渡すと、テキストではなく構造化された JSON 説明を出力できます:

```bash
$ my-cli deploy --help --json
{"schemaVersion":1,"kind":"command","cli":{"name":"my-cli"},"command":{"path":["deploy"],"name":"deploy","aliases":[],"examples":[]},"args":[],"options":[{"name":"help","short":"h","source":"framework","type":"boolean","description":"Show help","required":false,"multiple":false,"negatable":false}],"commands":[]}
```

JSON ヘルプは、コマンドやグループの説明だけでなく、コマンドが見つからない場合の候補表示にも対応しています。これはコマンドの実行結果ではなく、CLI のコマンド構成や引数・オプションを説明するものなので、コマンド側で `json: true` を設定している必要はありません。`defineCommand({ help })` や `rune.config.ts` のカスタムヘルプレンダラーはテキスト専用であり、`--help --json` には適用されません。
