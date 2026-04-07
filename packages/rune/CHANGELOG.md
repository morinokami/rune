# @rune-cli/rune

## 0.0.19

### Patch Changes

- [#68](https://github.com/morinokami/rune/pull/68) [`78d1da8`](https://github.com/morinokami/rune/commit/78d1da81dd60843748cd1dfa5ea3a2bf23ef8b25) Thanks [@morinokami](https://github.com/morinokami)! - fix: align runCommand stderr output with actual CLI behavior

- [#66](https://github.com/morinokami/rune/pull/66) [`fc79c5c`](https://github.com/morinokami/rune/commit/fc79c5ca2bdd8acc134003be26e0f848f89e8176) Thanks [@morinokami](https://github.com/morinokami)! - fix: surface descriptive error messages for type-level constraint violations

## 0.0.18

### Patch Changes

- [#65](https://github.com/morinokami/rune/pull/65) [`1999269`](https://github.com/morinokami/rune/commit/1999269589cbdcbbea936e1aa7d4eccea97a7cf2) Thanks [@morinokami](https://github.com/morinokami)! - fix: hide type hint for boolean options in help output

- [#63](https://github.com/morinokami/rune/pull/63) [`ab96b97`](https://github.com/morinokami/rune/commit/ab96b977d6b01adcc1dc2f73a2ddf458f9cf904d) Thanks [@morinokami](https://github.com/morinokami)! - fix: show subcommands in help for command nodes with children

## 0.0.17

### Patch Changes

- [#59](https://github.com/morinokami/rune/pull/59) [`86ffa3f`](https://github.com/morinokami/rune/commit/86ffa3fadaaab018bf35b14449267befd837eca7) Thanks [@morinokami](https://github.com/morinokami)! - docs: add API reference pages and re-export CommandError from @rune-cli/rune

## 0.0.16

### Patch Changes

- [#58](https://github.com/morinokami/rune/pull/58) [`5c67823`](https://github.com/morinokami/rune/commit/5c67823b2353d0650dc52002e3fc7addebb0d773) Thanks [@morinokami](https://github.com/morinokami)! - refactor(rune): align Rune CLI help and routing with framework infrastructure

- [#56](https://github.com/morinokami/rune/pull/56) [`d9d3b2a`](https://github.com/morinokami/rune/commit/d9d3b2ab4ac853ebadaddc852563a7fea1e532d7) Thanks [@morinokami](https://github.com/morinokami)! - feat(core): add CommandError for structured command failures

## 0.0.15

### Patch Changes

- [#51](https://github.com/morinokami/rune/pull/51) [`8290059`](https://github.com/morinokami/rune/commit/8290059e58a91ea4112258b3a18616e55a4fdd82) Thanks [@morinokami](https://github.com/morinokami)! - feat(test-utils): redesign runCommand to accept argv instead of pre-parsed objects

## 0.0.14

### Patch Changes

- [`04c0bf4`](https://github.com/morinokami/rune/commit/04c0bf4879646f561a6b97390969549310e36eb5) Thanks [@morinokami](https://github.com/morinokami)! - feat(core): add command output API and JSON mode

- [#46](https://github.com/morinokami/rune/pull/46) [`19aeddb`](https://github.com/morinokami/rune/commit/19aeddb632b5709d50b20dd95216464ac617583b) Thanks [@morinokami](https://github.com/morinokami)! - feat(core): add compile-time validation for field names, duplicates, and short names

## 0.0.13

### Patch Changes

- [#44](https://github.com/morinokami/rune/pull/44) [`8302231`](https://github.com/morinokami/rune/commit/8302231fbbeda8f7516e8bceb05675c24d0aab26) Thanks [@morinokami](https://github.com/morinokami)! - feat(core): support camelCase access for kebab-case args and options

- [#42](https://github.com/morinokami/rune/pull/42) [`3b2db62`](https://github.com/morinokami/rune/commit/3b2db62ae8ba43190072951dbc02744d22c86985) Thanks [@morinokami](https://github.com/morinokami)! - feat(core): add `examples` option to `defineCommand` and `defineGroup`

## 0.0.12

### Patch Changes

- [#40](https://github.com/morinokami/rune/pull/40) [`481cb9e`](https://github.com/morinokami/rune/commit/481cb9e340004d75a03d5bfeecc655771987592f) Thanks [@morinokami](https://github.com/morinokami)! - rename(cli): rename `rune dev` subcommand to `rune run`

## 0.0.11

### Patch Changes

- [#36](https://github.com/morinokami/rune/pull/36) [`4622c5d`](https://github.com/morinokami/rune/commit/4622c5d57be307a811a2e5369747f13baef0fb3c) Thanks [@morinokami](https://github.com/morinokami)! - refactor(core): rename option `alias` to `short`

- [#34](https://github.com/morinokami/rune/pull/34) [`b24beea`](https://github.com/morinokami/rune/commit/b24beeab6a2e7c2e26372345c1076464b712dae2) Thanks [@morinokami](https://github.com/morinokami)! - feat: add command and group aliases

## 0.0.10

### Patch Changes

- [#29](https://github.com/morinokami/rune/pull/29) [`0628f15`](https://github.com/morinokami/rune/commit/0628f15a0f46eab53e5c664c33cd62b9fe8da0d4) Thanks [@morinokami](https://github.com/morinokami)! - feat(manifest): support bare command files

- [#31](https://github.com/morinokami/rune/pull/31) [`520b5b1`](https://github.com/morinokami/rune/commit/520b5b1f7e1b7af7573c8c2e4053326283e58134) Thanks [@morinokami](https://github.com/morinokami)! - feat(manifest): support group descriptions via `_group.ts`

## 0.0.9

### Patch Changes

- [#28](https://github.com/morinokami/rune/pull/28) [`d2c5ef1`](https://github.com/morinokami/rune/commit/d2c5ef1efe6024af561ce438b701e751f023624b) Thanks [@morinokami](https://github.com/morinokami)! - fix(manifest): show actionable error when commands directory is empty

- [#26](https://github.com/morinokami/rune/pull/26) [`91d7e63`](https://github.com/morinokami/rune/commit/91d7e6300a0beb6ee71695ba46a48b66bbdd1a29) Thanks [@morinokami](https://github.com/morinokami)! - fix(core): validate that defineCommand() receives a run function

## 0.0.8

### Patch Changes

- [#21](https://github.com/morinokami/rune/pull/21) [`aaf328a`](https://github.com/morinokami/rune/commit/aaf328a9ea61c53ae737225c62f486c84228e169) Thanks [@morinokami](https://github.com/morinokami)! - fix(core): validate option names and aliases

- [#24](https://github.com/morinokami/rune/pull/24) [`162acd1`](https://github.com/morinokami/rune/commit/162acd1180bf9995a1feb30f4b434bffd52569a5) Thanks [@morinokami](https://github.com/morinokami)! - fix(core): validate that arg and option fields have a type or schema

- [#23](https://github.com/morinokami/rune/pull/23) [`54a657d`](https://github.com/morinokami/rune/commit/54a657de047344e037df256c458eefcfce3a7e33) Thanks [@morinokami](https://github.com/morinokami)! - fix(core): default omitted primitive boolean options to false

## 0.0.7

### Patch Changes

- [#19](https://github.com/morinokami/rune/pull/19) [`ba95ed3`](https://github.com/morinokami/rune/commit/ba95ed331f48ef0ad5a8c45933c0643b24f8c62b) Thanks [@morinokami](https://github.com/morinokami)! - feat(rune): validate that command modules export a defineCommand() value

## 0.0.6

### Patch Changes

- [#16](https://github.com/morinokami/rune/pull/16) [`8cd0fff`](https://github.com/morinokami/rune/commit/8cd0fff01e84e881955641e30b6a8c422530e21e) Thanks [@morinokami](https://github.com/morinokami)! - feat(cli): add --version support to Rune-built CLIs

## 0.0.5

### Patch Changes

- [#10](https://github.com/morinokami/rune/pull/10) [`3b677d5`](https://github.com/morinokami/rune/commit/3b677d5cee8b1b57dd192fb0e7e9a84de1537026) Thanks [@morinokami](https://github.com/morinokami)! - fix(cli): improve error messages with actionable hints

## 0.0.4

### Patch Changes

- [#7](https://github.com/morinokami/rune/pull/7) [`e5549fb`](https://github.com/morinokami/rune/commit/e5549fb68187d22847f865c4ad4db2c72a878d70) Thanks [@morinokami](https://github.com/morinokami)! - feat(cli): add --version / -V flag to rune command

## 0.0.3

### Patch Changes

- [#6](https://github.com/morinokami/rune/pull/6) [`d08ea87`](https://github.com/morinokami/rune/commit/d08ea87c243a1681c96886c9acba0aa63e916a7f) Thanks [@morinokami](https://github.com/morinokami)! - refactor(cli): improve help messages
