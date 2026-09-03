# 迷路ジェネレーター

生成アルゴリズムの動きをそのまま眺められる迷路生成 WEB アプリ。Vite + Svelte 5 (runes) + TypeScript。

```bash
npm install
npm run dev
```

| コマンド         | 内容                                         |
| ---------------- | -------------------------------------------- |
| `npm run dev`    | 開発サーバー (http://localhost:5173)         |
| `npm run build`  | 本番ビルド → `dist/`                         |
| `npm run check`  | svelte-check + tsc による型チェック          |
| `npm run lint`   | ESLint（`lint:fix` で自動修正）              |
| `npm run format` | Prettier で整形（`format:check` で検査のみ） |

## 開発ツール

| ツール                            | 担当                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Prettier + prettier-plugin-svelte | 整形。`.svelte` はマークアップ・script・style すべて                                         |
| ESLint + eslint-plugin-svelte     | lint。テンプレートまで構文解析するので、マークアップでしか使わない変数を未使用と誤検出しない |
| svelte-check                      | 型・a11y・未使用 CSS の検査                                                                  |
| Lefthook                          | Git フック。pre-commit で Prettier → ESLint、commit-msg で commitlint                        |
| commitlint                        | Conventional Commits の検証                                                                  |

Biome も検討したが、`.svelte` は `<script>` ブロックしか読めない。マークアップが見えないため
テンプレートでしか使わない変数がすべて未使用として誤検出され、フォーマッタは script ブロックの
インデントを剥がして Svelte 標準の整形と衝突する。このプロジェクトは `.svelte` が中心なので、
Svelte 公式アドオン（`sv add prettier eslint`）と同じ構成に一本化した。

`npm install` すると `prepare` スクリプトが `lefthook install` を走らせ、フックが有効になる。

### 言語の使い分け

**コード内コメントとコミットメッセージは英語で書く。**

| 対象                                                       | 言語   |
| ---------------------------------------------------------- | ------ |
| コード内コメント（`.ts` / `.svelte` のコメント、JSDoc）    | 英語   |
| コミットメッセージ（type / scope / subject / body すべて） | 英語   |
| UI に表示される文字列（アルゴリズム名・ラベル・凡例など）  | 日本語 |
| ドキュメント（README.md / CLAUDE.md）                      | 日本語 |

### コミットメッセージ

Conventional Commits に従う。commit-msg フックで検証される。

```
feat(maze): draw start and goal markers
fix(renderer): stop outer walls from being clipped in half
chore: set up Prettier, ESLint and Lefthook
```

## 実装の考え方

生成アルゴリズムを **ジェネレータ関数** として書くのが中心的な設計判断。

```ts
export type MazeAlgorithm = (ctx: MazeContext, rng: () => number) => Generator<void, void, void>
```

各アルゴリズムは `MazeContext`（盤面 + 各セルの進捗状態）を破壊的に更新しながら 1 ステップずつ `yield` する。呼び出し側は

- 毎フレーム少しずつ `next()` を呼べば **生成過程のアニメーション**
- `done` になるまで回し切れば **一括生成**

を同じコードから得られる。アルゴリズム側にアニメーション用の分岐は一切要らない。

迷路は「セルごとに、どの方向へ通路が開いているか」のビットマスク (`Uint8Array`) で保持する。壁のリストを持つより軽く、隣接セルとビットを一組で立てるだけで整合が取れる。

描画は Canvas 2D。差分描画はせず毎フレーム全部描き直すが、同じ色のセルをまとめて塗り、壁は 1 本の Path に集約して一度だけ `stroke()` するので、6,300 セル（90×70）でも 1 フレームに収まる。

## ディレクトリ

```
src/
  App.svelte              UI と再生ループ（rAF）
  lib/
    MazeCanvas.svelte     canvas のサイズ追従と再描画の窓口
    maze/
      types.ts            Grid / MazeContext / MazeAlgorithm の定義
      grid.ts             セル・方向・リンク操作
      rng.ts              mulberry32（シードを固定すれば同じ迷路になる）
      renderer.ts         Canvas 2D への描画
      algorithms/
        index.ts          UI に出す一覧（レジストリ）
        backtracker.ts    再帰的バックトラッカー
        kruskal.ts        Kruskal 法
        prim.ts           ランダム化 Prim 法
```

## アルゴリズムを足す

1. `src/lib/maze/algorithms/` に `MazeAlgorithm` を 1 つ書く
2. `algorithms/index.ts` の配列に 1 行足す

UI の選択肢と説明文はそこから生成されるので、他に触る場所はない。

生成物は **完全迷路**（全セルが連結し、閉路が 1 つもない全域木）であることが前提。新しいアルゴリズムを足したら、辺の数が「セル数 − 1」になっているか、全セルに到達できるかを確認しておくとよい。
