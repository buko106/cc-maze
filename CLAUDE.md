# cc-maze

迷路の生成と探索を可視化する WEB アプリ。概要・コマンド・設計方針は [README.md](README.md) を参照。

## 言語の使い分け

**コード内コメントとコミットメッセージは英語で書く。**

| 対象                                                       | 言語   |
| ---------------------------------------------------------- | ------ |
| コード内コメント（`.ts` / `.svelte` のコメント、JSDoc）    | 英語   |
| コミットメッセージ（type / scope / subject / body すべて） | 英語   |
| UI に表示される文字列（アルゴリズム名・ラベル・凡例など）  | 日本語 |
| ドキュメント（README.md / CLAUDE.md）                      | 日本語 |
| ユーザーとのやり取り                                       | 日本語 |

UI 文字列を英語にしないこと。このアプリの画面は日本語で作られている。

## コミットメッセージ

Conventional Commits に従う。commit-msg フックで commitlint が検証するため、
形式を外すとコミットが失敗する。

```
feat(maze): draw start and goal markers
fix(renderer): stop outer walls from being clipped in half
chore: set up Prettier, ESLint and Lefthook
```
