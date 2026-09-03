import { DIRS, link, neighbor, pick, type Direction } from '../grid'
import { DONE, FRONTIER, UNVISITED, type MazeAlgorithm } from '../types'

/**
 * Randomised Prim's algorithm.
 * Repeatedly pick a random frontier cell -- one that touches the passages built
 * so far -- and connect it.
 * The region spreads outwards from a single point, leaving many short dead ends.
 */
export const prim: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const frontier: number[] = []

  /** Add the unvisited neighbours of cell to the frontier */
  const expand = (cell: number) => {
    for (const dir of DIRS) {
      const next = neighbor(grid, cell, dir)
      if (next >= 0 && state[next] === UNVISITED) {
        state[next] = FRONTIER
        frontier.push(next)
      }
    }
  }

  const start = Math.floor(rng() * grid.links.length)
  state[start] = DONE
  expand(start)

  const connectable: Direction[] = []

  while (frontier.length > 0) {
    // Order carries no meaning, so swapping with the last entry and popping removes in O(1)
    const index = Math.floor(rng() * frontier.length)
    const cell = frontier[index]
    frontier[index] = frontier[frontier.length - 1]
    frontier.pop()

    // A cell only joins the frontier next to a passage, so there is always somewhere to connect
    connectable.length = 0
    for (const dir of DIRS) {
      const next = neighbor(grid, cell, dir)
      if (next >= 0 && state[next] === DONE) connectable.push(dir)
    }

    link(grid, cell, pick(connectable, rng))
    state[cell] = DONE
    ctx.active = [cell]
    expand(cell)
    yield
  }

  ctx.active = []
}
