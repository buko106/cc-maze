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
  readonly run: SolveAlgorithm
}

/** Adding one line here is enough to add a choice to the UI. */
export const solvers: readonly SolverEntry[] = [
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
      'ループができると壁が島になり、そこに乗ると回り続けて出られなくなる。この迷路はスタートもゴールも外壁に接しているので実際にはたどり着くが、通った輪がそのまま経路に残り、同じセルを何度も通る線になる。',
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

export function getSolver(id: string): SolverEntry {
  return solvers.find((entry) => entry.id === id) ?? solvers[0]
}
