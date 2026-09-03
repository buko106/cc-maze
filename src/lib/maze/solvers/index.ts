import type { SolveAlgorithm } from '../types'
import { astar } from './astar'
import { bfs } from './bfs'
import { dfs } from './dfs'

export interface SolverEntry {
  readonly id: string
  readonly name: string
  /** One-line blurb for the UI. Describes how the search spreads. */
  readonly description: string
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
]

export function getSolver(id: string): SolverEntry {
  return solvers.find((entry) => entry.id === id) ?? solvers[0]
}
