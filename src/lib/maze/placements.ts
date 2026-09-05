import { cornerEndpoints, randomEndpoints } from './grid'
import type { Endpoints } from './types'

export interface PlacementEntry {
  readonly id: string
  readonly name: string
  /** One-line blurb for the UI. Describes where the two ends end up. */
  readonly description: string
  /**
   * Takes an rng even when it does not need one, so the caller can hand the
   * same one to every entry and stay clear of Math.random.
   */
  readonly place: (cols: number, rows: number, rng: () => number) => Endpoints
}

/** Adding one line here is enough to add a choice to the UI. */
export const placements: readonly PlacementEntry[] = [
  {
    id: 'corners',
    name: '固定',
    description:
      'S を左上、G を右下に置く。外壁の上と下に出入口が開き、迷路の端から端までを歩くことになる。',
    place: cornerEndpoints,
  },
  {
    id: 'random',
    name: 'ランダム',
    description:
      '生成のたびに S と G を別の場所へ置く。離れた 2 セルを選ぶので隣り合うことはない。外壁に接したセルに当たったときだけ、そこに出入口が開く。',
    place: randomEndpoints,
  },
]

export function getPlacement(id: string): PlacementEntry {
  return placements.find((entry) => entry.id === id) ?? placements[0]
}
