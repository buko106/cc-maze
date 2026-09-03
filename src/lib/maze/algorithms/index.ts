import type { MazeAlgorithm } from '../types'
import { backtracker } from './backtracker'
import { kruskal } from './kruskal'
import { prim } from './prim'

export interface AlgorithmEntry {
  readonly id: string
  readonly name: string
  /** One-line blurb for the UI. Describes the character of the mazes it makes. */
  readonly description: string
  readonly run: MazeAlgorithm
}

/** Adding one line here is enough to add a choice to the UI. */
export const algorithms: readonly AlgorithmEntry[] = [
  {
    id: 'backtracker',
    name: '再帰的バックトラッカー',
    description:
      '行き止まりまで掘り進み、詰まったら分岐点まで戻る。長い一本道が多く、解きごたえのある迷路になる。',
    run: backtracker,
  },
  {
    id: 'kruskal',
    name: 'Kruskal 法',
    description:
      'シャッフルした壁を順に見て、両側が未接続なら壊す。散らばった島が最後にひとつへ融合する。',
    run: kruskal,
  },
  {
    id: 'prim',
    name: 'Prim 法',
    description:
      '通路に隣接する候補からランダムに選んで繋げる。1 点から放射状に広がり、短い行き止まりが多い。',
    run: prim,
  },
]

export function getAlgorithm(id: string): AlgorithmEntry {
  return algorithms.find((entry) => entry.id === id) ?? algorithms[0]
}
