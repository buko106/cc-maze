import { DIRS, link, neighbor, shuffle } from '../grid'
import { DONE, TRAIL, UNVISITED, type MazeAlgorithm } from '../types'

/**
 * Wilson's algorithm: loop-erased random walk.
 * Wander at random from a cell outside the tree until the tree is reached, then
 * carve the walk in. Whenever the walk crosses itself the loop it just made is
 * thrown away, which is what keeps the result unbiased -- every possible maze of
 * a given size comes out equally often, which is not true of any of the others
 * here. The price is a slow start: with almost no tree to aim at, the first few
 * walks wander for a long time.
 */
export const wilson: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const size = grid.links.length

  // step[cell] is the direction the current walk leaves that cell by. Writing
  // over it on a revisit is what erases the loop.
  const step = new Int8Array(size).fill(-1)
  const openDirs: number[] = []

  // Seed the tree with a single cell
  const seed = Math.floor(rng() * size)
  state[seed] = DONE
  let remaining = size - 1

  const order = shuffle(
    Array.from({ length: size }, (_, i) => i),
    rng,
  )
  let cursor = 0

  while (remaining > 0) {
    while (state[order[cursor]] === DONE) cursor++
    const from = order[cursor]

    // Wander until the tree is hit
    let at = from
    state[at] = TRAIL
    while (state[at] !== DONE) {
      ctx.active = [at]

      openDirs.length = 0
      for (let d = 0; d < DIRS.length; d++) {
        if (neighbor(grid, at, DIRS[d]) >= 0) openDirs.push(d)
      }
      const chosen = openDirs[Math.floor(rng() * openDirs.length)]
      const next = neighbor(grid, at, DIRS[chosen])
      step[at] = chosen

      if (state[next] === TRAIL) {
        // The walk closed a loop: drop everything it did between the two visits
        let stale = neighbor(grid, next, DIRS[step[next]])
        while (stale !== next) {
          const onwards = step[stale]
          state[stale] = UNVISITED
          step[stale] = -1
          stale = neighbor(grid, stale, DIRS[onwards])
        }
      } else if (state[next] === UNVISITED) {
        state[next] = TRAIL
      }

      at = next
      yield
    }

    // Carve the walk into the tree, following the directions it left behind
    const target = at
    let walk = from
    while (walk !== target) {
      state[walk] = DONE
      remaining--
      ctx.active = [walk]
      walk = link(grid, walk, DIRS[step[walk]])
      yield
    }
  }

  ctx.active = []
}
