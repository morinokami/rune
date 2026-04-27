---
title: CLI
description: rune コマンドラインツールのリファレンス。
---

## `rune run`

ビルドせずに Rune プロジェクトをソースから直接実行します。Rune が管理するオプション（`--project` など）はコマンド名より前に指定する必要があります。コマンド名以降のすべての引数は、ユーザーのコマンドにそのまま渡されます。

```bash
rune run [options] <command> [command-args...]
```

### オプション

| オプション | 型 | 説明 |
|---|---|---|
| `--project <path>` | `string` | Rune プロジェクトのルートパス。デフォルトはカレントディレクトリ。 |

### 使用例

```bash
rune run hello
rune run --project ./my-app hello
rune run greet world --loud
```

`rune run` は実行前に `.rune/global-options.d.ts` を再生成し、エディタの型推論を最新の状態に保ちます。

## `rune sync`

Rune プロジェクトの型メタデータを生成し、グローバルオプションとコマンドオプションの衝突を検証します。

```bash
rune sync [options]
```

### オプション

| オプション | 型 | 説明 |
|---|---|---|
| `--project <path>` | `string` | Rune プロジェクトのルートパス。デフォルトはカレントディレクトリ。 |

### 使用例

```bash
rune sync
rune sync --project ./my-app
```

## `rune build`

Rune プロジェクトを配布可能な CLI にビルドします。

```bash
rune build [options]
```

### オプション

| オプション | 型 | 説明 |
|---|---|---|
| `--project <path>` | `string` | Rune プロジェクトのルートパス。デフォルトはカレントディレクトリ。 |

### 使用例

```bash
rune build
rune build --project ./my-app
```

`rune build` はビルド前に `.rune/global-options.d.ts` を再生成し、グローバルオプションとコマンドオプションの衝突を検証します。
