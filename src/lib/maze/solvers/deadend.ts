import { openNeighbors } from '../grid'
import { SEARCHED, type SolveAlgorithm } from '../types'

/**
 * Dead-end filling.
 * Turns the question around: instead of looking for the route, plug every dead
 * end and keep plugging, because a cell that has become a dead end cannot have
 * been on the route either. What is still open at the end is the route.
 * It pays no attention to where the goal is, so it ends up touching nearly
 * every cell that is not on the route -- the cost is roughly the whole maze,
 * whatever the shape.
 */
export const deadEndFilling: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx
  const size = grid.links.length
  const filled = new Uint8Array(size)
  const open: number[] = []

  /** Ways out of a cell that have not been plugged yet. */
  const waysOut = (cell: number): number => {
    let count = 0
    for (const next of openNeighbors(grid, cell, open)) {
      if (!filled[next]) count++
    }
    return count
  }

  const pluggable = (cell: number): boolean =>
    cell !== start && cell !== goal && !filled[cell] && waysOut(cell) === 1

  const queue: number[] = []
  for (let i = 0; i < size; i++) {
    if (pluggable(i)) queue.push(i)
  }

  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]
    // Queued cells can gain or lose ways out before their turn comes
    if (!pluggable(cell)) continue

    filled[cell] = 1
    state[cell] = SEARCHED
    ctx.expanded++
    ctx.active = [cell]

    // Plugging this one may have turned a neighbour into a dead end
    for (const next of openNeighbors(grid, cell, open)) {
      if (pluggable(next)) queue.push(next)
    }
    yield
  }

  // Only the route is still open, so walking it is just "keep going forwards"
  const route = [start]
  let previous = -1
  let at = start
  while (at !== goal) {
    let onwards = -1
    for (const next of openNeighbors(grid, at, open)) {
      if (filled[next] || next === previous) continue
      onwards = next
      break
    }
    if (onwards < 0) break
    previous = at
    at = onwards
    route.push(at)
  }

  ctx.path = route
  ctx.found = at === goal
  ctx.active = []
}
