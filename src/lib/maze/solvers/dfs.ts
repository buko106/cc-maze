import { openNeighbors } from '../grid'
import { SEARCHED, UNSEEN, type SolveAlgorithm } from '../types'

/**
 * Depth-first search.
 * Keep walking into the first unseen neighbour and rewind the stack at every
 * dead end. The stack is handed to the renderer as the route, so the drawn line
 * grows and shrinks exactly like a finger tracing the maze.
 * An explicit stack instead of recursion, so a huge maze cannot blow the call stack.
 */
export const dfs: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx
  const stack = [start]
  const open: number[] = []

  // Same array the whole way through: the renderer sees every push and pop
  ctx.path = stack
  state[start] = SEARCHED
  ctx.expanded = 1

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    ctx.active = [current]

    if (current === goal) {
      ctx.found = true
      ctx.active = []
      return
    }

    let next = -1
    for (const candidate of openNeighbors(grid, current, open)) {
      if (state[candidate] === UNSEEN) {
        next = candidate
        break
      }
    }

    if (next < 0) {
      // Dead end, or every way on has been walked already: step back
      stack.pop()
    } else {
      state[next] = SEARCHED
      ctx.expanded++
      stack.push(next)
    }
    yield
  }

  ctx.active = []
}
