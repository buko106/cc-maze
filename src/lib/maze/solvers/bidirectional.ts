import { openNeighbors } from '../grid'
import { FRINGE, FRINGE_BACK, SEARCHED, SEARCHED_BACK, UNSEEN, type SolveAlgorithm } from '../types'

/**
 * Bidirectional breadth-first search.
 * Two waves, one from the start and one from the goal, taking strict turns a
 * cell at a time. The moment one of them steps onto a cell the other has
 * already reached, the two halves are stitched together.
 * Each wave only has to grow half as far as a single one would, and the area a
 * wave covers grows with the square of its reach, so meeting in the middle
 * costs noticeably fewer cells than plain breadth-first search.
 */
export const bidirectional: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx
  const size = grid.links.length
  const open: number[] = []

  // Index 0 is the wave from the start, index 1 the wave from the goal
  const cameFrom = [new Int32Array(size).fill(-1), new Int32Array(size).fill(-1)]
  const queue = [[start], [goal]]
  const head = [0, 0]
  const seen = [new Uint8Array(size), new Uint8Array(size)]
  const fringePaint = [FRINGE, FRINGE_BACK]
  const searchedPaint = [SEARCHED, SEARCHED_BACK]

  if (start === goal) {
    state[start] = SEARCHED
    ctx.path = [start]
    ctx.expanded = 1
    ctx.found = true
    return
  }

  seen[0][start] = 1
  seen[1][goal] = 1
  state[start] = FRINGE
  state[goal] = FRINGE_BACK

  /**
   * Build the whole route through the cell where the waves met. Reading one
   * trail of parents backwards and the other forwards gives start to goal, no
   * matter which wave arrived last.
   */
  const stitch = (meeting: number): number[] => {
    const route: number[] = []
    for (let at = meeting; at >= 0; at = cameFrom[0][at]) route.push(at)
    route.reverse()
    for (let at = cameFrom[1][meeting]; at >= 0; at = cameFrom[1][at]) route.push(at)
    return route
  }

  // Strict alternation. Picking whichever frontier is smaller sounds better but
  // lets one wave starve the other in a plain corridor.
  let side = 1

  while (head[0] < queue[0].length && head[1] < queue[1].length) {
    side = side === 0 ? 1 : 0
    const other = side === 0 ? 1 : 0

    const current = queue[side][head[side]++]
    state[current] = searchedPaint[side]
    ctx.expanded++
    ctx.active = [current]

    for (const next of openNeighbors(grid, current, open)) {
      if (seen[side][next]) continue
      seen[side][next] = 1
      cameFrom[side][next] = current

      if (seen[other][next]) {
        ctx.path = stitch(next)
        ctx.found = true
        ctx.active = []
        return
      }

      if (state[next] === UNSEEN) state[next] = fringePaint[side]
      queue[side].push(next)
    }
    yield
  }

  ctx.active = []
}
