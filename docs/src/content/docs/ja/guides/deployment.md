---
title: デプロイ
description: Rune の CLI アプリケーションをデプロイする方法について学ぶ。
---

Rune で作成した CLI は、通常の npm パッケージとして公開できます。Rune のスターターは `dist/cli.mjs` を `bin` エントリとして公開する構成になっているため、公開向けの設定を整えた上で `rune build` を実行すれば npm にアップロードできます。

このガイドでは、npm への公開に必要な最小限の手順について説明します。

## `package.json` の確認

npm に公開する前に、少なくとも次の項目を確認してください。

- `name`: npm 上で公開するパッケージ名
- `version`: 公開するバージョン
- `bin`: CLI の実行ファイル。スターターのデフォルトは `dist/cli.mjs`
- `files`: npm に含めるファイル。スターターのデフォルトは `["dist"]`
- `type`: ESM として公開するための `"module"`
- `private`: 生成されたプロジェクトでは自動的に削除されます。リポジトリ内のスターターを直接コピーした場合は、公開前に `true` を外してください
- `engines`: 対応する Node.js のバージョン

スターターの `package.json` のうち、公開に関係する主な項目は次のとおりです:

```json
{
  "name": "my-cli",
  "version": "0.0.0",
  "bin": {
    "my-cli": "dist/cli.mjs"
  },
  "files": [
    "dist"
  ],
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  }
}
```

実際に公開する前に、`name` と `version` を自分のパッケージ用に変更してください。`create-rune-app` を使わずにリポジトリ内のスターターを直接コピーした場合は、`private: true` を削除または `false` にしてください。

## `rune build` の実行

Rune の公開用 CLI は `rune build` によって生成されます。`npm publish` の前に必ずビルドしてください。

```sh
npm run build
```

ビルドが成功すると、`dist/` 以下に次のファイルが生成されます:

- `dist/cli.mjs`: `bin` で指定された CLI のエントリポイント
- `dist/manifest.json`: コマンドツリーのマニフェスト
- `dist/commands/...`: 各コマンドのビルド済みモジュール

## 依存関係の置き場所

Rune をビルドすると、アプリ本体のソースは `dist/` にまとめられますが、サードパーティのパッケージは通常の npm パッケージと同様に実行時に解決されます。そのため、コマンドの実行時に `import` されるサードパーティパッケージは `dependencies` に置く必要があります。

- 実行時に読み込まれるパッケージは `dependencies`
- 公開後の CLI 実行時に不要なパッケージは `devDependencies`

たとえば、以下のようにコマンドの中で `chalk` を使っている場合は、`dependencies` に置く必要があります:

```ts
import { defineCommand } from "@rune-cli/rune";
import chalk from "chalk";

export default defineCommand({
  run({ output }) {
    output.log(chalk.green("ok"));
  },
});
```

一方で、`vitest` や `typescript` のように開発時だけに使うものは `devDependencies` のままで構いません。また、Rune のランタイムはビルド時にバンドルされるため、`@rune-cli/rune` も `devDependencies` に指定して問題ありません。

## `npm pack` による公開内容の確認

パッケージをすぐに `npm publish` する前に、まず `npm pack` で公開される tarball を確認しておくと安全です。

```sh
npm pack
```

これにより、実際に npm に送られる内容をローカルで確認できます。特に次の点を見ておきましょう:

- `dist/` が含まれていること
- 不要なソースファイルやテストが含まれていないこと
- `bin` が `dist/cli.mjs` を指していること

## npm への公開

準備ができたら、npm にログインして公開します。

```sh
npm login
npm publish
```

スコープ付きパッケージ（例: `@your-org/my-cli`）を公開する場合で、公開範囲を public にしたいときは `--access public` を付けてください。詳しくは [npm のスコープ付き公開パッケージのドキュメント](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) を参照してください。

```sh
npm publish --access public
```

公開後は次のように実行できます。

```sh
npx my-cli hello
```

または、グローバルにインストールした上で通常のコマンドとして実行できます。

```sh
npm install -g my-cli
my-cli hello
```

## よくある失敗

- リポジトリ内のスターターを直接コピーした結果、`private: true` のままで publish している
- `rune build` を実行せずに publish している
- 実行時依存を `devDependencies` に入れている
- スコープ付きパッケージなのに `npm publish --access public` を付けていない

公開後に `Cannot find package ...` のようなエラーが出る場合は、そのパッケージが `dependencies` に入っているかをまず確認してください。
