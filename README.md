# 迷路ジェネレーター

迷路を作るところと、解くところをそのまま眺められる WEB アプリ。Vite + Svelte 5 (runes) + TypeScript。

**公開先: https://www.buko106.tokyo/cc-maze/**（`main` への push で GitHub Pages へ自動デプロイ）

- **生成**: 再帰的バックトラッカー / Kruskal 法 / Prim 法
- **探索**: 深さ優先探索 (DFS) / 幅優先探索 (BFS) / A\* (マンハッタン距離)

生成が終わると探索ボタンが有効になる。生成と探索はそれぞれ独立に手法と速度を選べるので、
同じ迷路を別の手法で解き直して見比べられる。

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

アルゴリズムを **ジェネレータ関数** として書くのが中心的な設計判断。生成も探索も同じ形をしている。

```ts
export type MazeAlgorithm = (ctx: MazeContext, rng: () => number) => Generator<void, void, void>
export type SolveAlgorithm = (ctx: SolveContext) => Generator<void, void, void>
```

各アルゴリズムはコンテキスト（盤面 + 各セルの進捗状態）を破壊的に更新しながら 1 ステップずつ `yield` する。呼び出し側は

- 毎フレーム少しずつ `next()` を呼べば **過程のアニメーション**
- `done` になるまで回し切れば **一括実行**

を同じコードから得られる。アルゴリズム側にアニメーション用の分岐は一切要らない。

探索側に `rng` を渡していないのは意図的で、同じ迷路を同じ手法で解けば必ず同じ結果になる。手法どうしの比較が再現できる。

迷路は「セルごとに、どの方向へ通路が開いているか」のビットマスク (`Uint8Array`) で保持する。壁のリストを持つより軽く、隣接セルとビットを一組で立てるだけで整合が取れる。

生成の進捗 (`MazeContext.state`) と探索の進捗 (`SolveContext.state`) は別々の配列。同じ画面に重ねて描いても、色の意味が混ざらない。

描画は Canvas 2D。差分描画はせず毎フレーム全部描き直すが、同じ色のセルをまとめて塗り、壁は 1 本の Path に集約して一度だけ `stroke()` するので、6,300 セル（90×70）でも 1 フレームに収まる。経路はセル中心を結ぶ 1 本の太いラインとして、壁より先に描く。

### 探索手法の見どころ

完全迷路では 2 点を結ぶ道は 1 本しかないので、**どの手法でも見つかる経路は同じ**になる。差が出るのは「そこへ行き着くまでに何セル調べたか」で、パネルの `調べたセル` がそれを表す。28×20 の迷路の一例:

| 手法 | 調べたセル | 経路の長さ |
| ---- | ---------- | ---------- |
| DFS  | 376 / 560  | 157        |
| BFS  | 396 / 560  | 157        |
| A\*  | 302 / 560  | 157        |

## ディレクトリ

```
src/
  App.svelte              UI と再生ループ（rAF）
  lib/
    MazeCanvas.svelte     canvas のサイズ追従と再描画の窓口
    maze/
      types.ts            Grid / MazeContext / SolveContext と 2 つのアルゴリズム型
      grid.ts             セル・方向・リンク操作、探索用の近傍と経路復元
      rng.ts              mulberry32（シードを固定すれば同じ迷路になる）
      renderer.ts         Canvas 2D への描画（生成と探索を重ねて描く）
      algorithms/         生成
        index.ts          UI に出す一覧（レジストリ）
        backtracker.ts    再帰的バックトラッカー
        kruskal.ts        Kruskal 法
        prim.ts           ランダム化 Prim 法
      solvers/            探索
        index.ts          UI に出す一覧（レジストリ）
        dfs.ts            深さ優先探索
        bfs.ts            幅優先探索
        astar.ts          A*（マンハッタン距離 + 二分ヒープ）
```

`types.ts` は `MazeContext` / `SolveContext` の両方を持つ。`grid.ts` も同様に、生成用の
`createContext` / `link` と探索用の `createSolveContext` / `openNeighbors` / `tracePath` を並べている。

## アルゴリズムを足す

生成なら:

1. `src/lib/maze/algorithms/` に `MazeAlgorithm` を 1 つ書く
2. `algorithms/index.ts` の配列に 1 行足す

探索なら `src/lib/maze/solvers/` に `SolveAlgorithm` を書いて `solvers/index.ts` に 1 行足す。
UI の選択肢と説明文はそこから生成されるので、他に触る場所はない。

生成物は **完全迷路**（全セルが連結し、閉路が 1 つもない全域木）であることが前提。新しい生成
アルゴリズムを足したら、辺の数が「セル数 − 1」になっているか、全セルに到達できるかを確認して
おくとよい。探索を足したときは、返す経路がスタートに始まりゴールに終わること、隣り合うセルの
間に壁がないこと、そして BFS で求めた経路と一致することを確かめるとよい。
