import type { MazeAlgorithm } from '../types'
import { backtracker } from './backtracker'
import { division } from './division'
import { eller } from './eller'
import { kruskal } from './kruskal'
import { prim } from './prim'
import { wilson } from './wilson'

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
  {
    id: 'division',
    name: '再帰分割',
    description:
      '他とは逆に、何もない空間を壁で仕切っていく。一直線の長い壁と部屋ができ、見通しのよい迷路になる。',
    run: division,
  },
  {
    id: 'wilson',
    name: 'Wilson 法',
    description:
      'ランダムに歩き回り、輪を作ったらその分を消す。形の偏りが一切ない唯一の手法。序盤は延々と彷徨う。',
    run: wilson,
  },
  {
    id: 'eller',
    name: 'Eller 法',
    description:
      '1 行ずつ確定させ、上の行を二度と見ない。覚えておくのは 1 行分だけで、いくらでも長い迷路を作れる。',
    run: eller,
  },
]

export function getAlgorithm(id: string): AlgorithmEntry {
  return algorithms.find((entry) => entry.id === id) ?? algorithms[0]
}
