import { openNeighbors, tracePath } from '../grid'
import { FRINGE, SEARCHED, UNSEEN, type SolveAlgorithm } from '../types'

/**
 * Breadth-first search.
 * Expands in rings of equal distance from the start, so the first time the goal
 * is popped it has been reached by a shortest route.
 * The queue is an array with a moving head rather than shift(), which would be
 * O(n) per step.
 */
export const bfs: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx
  const parent = new Int32Array(grid.links.length).fill(-1)
  const queue = [start]
  const open: number[] = []
  let head = 0

  state[start] = FRINGE

  while (head < queue.length) {
    const current = queue[head++]
    state[current] = SEARCHED
    ctx.expanded++
    ctx.active = [current]

    if (current === goal) {
      ctx.path = tracePath(parent, goal)
      ctx.found = true
      ctx.active = []
      return
    }

    for (const next of openNeighbors(grid, current, open)) {
      if (state[next] !== UNSEEN) continue
      state[next] = FRINGE
      parent[next] = current
      queue.push(next)
    }
    yield
  }

  ctx.active = []
}
