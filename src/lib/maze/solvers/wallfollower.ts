import { DIRS, neighbor } from '../grid'
import { SEARCHED, UNSEEN, type SolveAlgorithm } from '../types'

/** Right, straight on, left, back -- the order a right-hand follower tries. */
const TURNS = [1, 0, 3, 2]

/**
 * Wall follower, keeping the right hand on the wall.
 * The only method here that never looks at the maze as a whole: it knows the
 * four walls of the cell it is standing in and nothing else, and still gets
 * there. A perfect maze has no free-standing wall to circle forever, so a
 * follower that starts on the outer wall is bound to reach the goal, though it
 * takes a long way round to do it.
 * The drawn route drops a cell whenever the walk doubles back, so what is left
 * is the plain route from the start to wherever the follower is now.
 */
export const wallFollower: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx

  let at = start
  // Entering through the opening in the top wall means heading south
  let facing = 2

  const route = [start]
  ctx.path = route
  state[start] = SEARCHED
  ctx.expanded = 1

  while (at !== goal) {
    ctx.active = [at]

    let stepped = false
    for (const turn of TURNS) {
      const dir = (facing + turn) % 4
      if (!(grid.links[at] & DIRS[dir].bit)) continue
      facing = dir
      at = neighbor(grid, at, DIRS[dir])
      stepped = true
      break
    }
    // A walled-in cell, which a connected maze does not contain
    if (!stepped) break

    if (state[at] === UNSEEN) {
      state[at] = SEARCHED
      ctx.expanded++
    }

    // In a perfect maze the only way back onto the route is the way we came,
    // so popping on a reversal keeps the route free of detours
    if (route.length >= 2 && route[route.length - 2] === at) route.pop()
    else route.push(at)

    yield
  }

  ctx.found = at === goal
  ctx.active = []
}
