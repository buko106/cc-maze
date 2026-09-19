import type { SolveAlgorithm } from '../types'
import { astar } from './astar'
import { bfs } from './bfs'
import { bidirectional } from './bidirectional'
import { deadEndFilling } from './deadend'
import { dfs } from './dfs'
import { wallFollower } from './wallfollower'

export interface SolverEntry {
  readonly id: string
  readonly name: string
  /** One-line blurb for the UI. Describes how the search spreads. */
  readonly description: string
  /**
   * What a loop does to this method, for the methods that lean on the maze
   * being perfect. Shown as a warning while the maze is braided.
   */
  readonly braidNote?: string
  /**
   * The search. Left out for solving by hand: there the person traces the route
   * on the maze, and trace.ts fills in the SolveContext a search would have.
   */
  readonly run?: SolveAlgorithm
}

/** An entry that runs a search of its own, which is every one but solving by hand. */
export type SearchEntry = SolverEntry & { readonly run: SolveAlgorithm }

/** Adding one line here is enough to add a choice to the UI. */
export const solvers: readonly SolverEntry[] = [
  {
    id: 'by-hand',
    name: '自分で解く',
    description:
      'S からドラッグして線を伸ばし、G を目指す。来た道を戻ると線が縮み、線の途中を押すとそこから描き直せる。矢印キーでも進める。',
  },
  {
    id: 'dfs',
    name: '深さ優先探索 (DFS)',
    description:
      '行けるところまで進み、行き止まりで分岐点まで戻る。線が伸び縮みしながら進む。運が悪いと迷路の大半を歩く。',
    run: dfs,
  },
  {
    id: 'bfs',
    name: '幅優先探索 (BFS)',
    description:
      'スタートから等距離のセルを輪のように広げていく。ゴール方向を知らないので探索範囲は最も広くなりやすい。',
    run: bfs,
  },
  {
    id: 'astar',
    name: 'A* (マンハッタン距離)',
    description:
      '「ここまでの歩数 + ゴールまでの直線距離」が小さいセルを優先。ゴール方向へ偏って伸び、無駄が最も少ない。',
    run: astar,
  },
  {
    id: 'bidirectional',
    name: '双方向 BFS',
    description:
      'スタートとゴールから交互に波を広げ、ぶつかった所で繋ぐ。多くの迷路で BFS より調べるセルが減る。',
    run: bidirectional,
  },
  {
    id: 'wall-follower',
    name: '右手法（壁伝い）',
    description:
      '右手を壁につけたまま歩き続ける。全体を見ずに手探りで進むので大回りするが、完全迷路なら必ず着く。',
    braidNote:
      'ループができると壁が島になり、そこに乗ると回り続けて出られなくなる。S と G を角に固定していれば外壁伝いに必ずゴールを通るが、通った輪がそのまま経路に残り、同じセルを何度も通る線になる。ランダム配置だと途中の島に乗ったまま「到達できず」に終わることの方が多い。',
    run: wallFollower,
  },
  {
    id: 'dead-end',
    name: '行き止まり埋め',
    description:
      '行き止まりを片端から塗り潰すと、最後に経路だけが残る。ゴールの方向を見ないので、ほぼ全面を塗る。',
    braidNote:
      'ループには行き止まりがないので埋め残る。残った分かれ道のどちらが経路かを決める手がかりがなく、少しでもループがあるとほとんど「到達できず」に終わる。',
    run: deadEndFilling,
  },
]

/** The ones with a search to run, for everything that has to run one. */
export const searches: readonly SearchEntry[] = solvers.filter(
  (entry): entry is SearchEntry => entry.run !== undefined,
)

/**
 * What the app starts on, and what a stored id that no longer exists falls back
 * to. A search rather than solving by hand, so that 解く on a first visit sets
 * one running, the way the page has always opened.
 */
export const DEFAULT_SOLVER_ID = 'dfs'

export function getSolver(id: string): SolverEntry {
  return solvers.find((entry) => entry.id === id) ?? solvers[0]
}
