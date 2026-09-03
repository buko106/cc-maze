import { DIRS, link, neighbor, pick, type Direction } from '../grid'
import { DONE, TRAIL, UNVISITED, type MazeAlgorithm } from '../types'

/**
 * Recursive backtracker (depth-first search).
 * Carve as far as possible, then rewind the stack to the last cell that still
 * has an unvisited neighbour.
 * Written with an explicit stack rather than recursion, so even a huge maze
 * cannot blow the call stack.
 */
export const backtracker: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const start = Math.floor(rng() * grid.links.length)
  const stack = [start]
  state[start] = TRAIL

  const unvisited: Direction[] = []

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    ctx.active = [current]

    unvisited.length = 0
    for (const dir of DIRS) {
      const next = neighbor(grid, current, dir)
      if (next >= 0 && state[next] === UNVISITED) unvisited.push(dir)
    }

    if (unvisited.length === 0) {
      // Dead end: settle this cell and step back
      state[current] = DONE
      stack.pop()
    } else {
      const next = link(grid, current, pick(unvisited, rng))
      state[next] = TRAIL
      stack.push(next)
    }
    yield
  }

  ctx.active = []
}
