/**
 * Helpers shared by the tests next to this file. Nothing in the app imports
 * them, so they never reach the bundle.
 */
import { braid } from './braid'
import { DIRS, createContext, createSolveContext, openNeighbors, randomEndpoints } from './grid'
import { createRng } from './rng'
import {
  DONE,
  type Grid,
  type MazeAlgorithm,
  type MazeContext,
  type SolveAlgorithm,
  type SolveContext,
} from './types'

/**
 * Steps a run is allowed before it counts as runaway. Two separate figures,
 * because the two halves have very different room above them. Measured over
 * 300 seeds at 20x20, the largest maze these tests build:
 *
 * - carving takes at most 12,942 steps, nearly all of that Wilson wandering
 *   about, and a random walk has no upper bound worth quoting -- hence the room
 * - solving takes at most 682, and the wall follower cannot exceed four steps
 *   per cell (1,600 here) without repeating a cell-and-facing pair
 *
 * The solve cap being tight is the point: two of the solvers only terminate
 * because of a guard, and a suite that hangs when one is broken is far harder
 * to read than one that fails.
 */
const GENERATION_CAP = 200_000
export const SOLVE_CAP = 10_000

/** Run a generator to the end and return how many steps it took. */
export function drain(steps: Generator<void, void, void>, cap = GENERATION_CAP): number {
  let count = 0
  while (!steps.next().done) {
    if (++count > cap) throw new Error(`still running after ${cap} steps`)
  }
  return count
}

export interface BuildOptions {
  cols?: number
  rows?: number
  seed?: number
  /** Share of the dead ends to open up, the way braid() takes it (0 to 1). */
  braidRatio?: number
  /** Drop S and G anywhere instead of leaving them in their corners. */
  randomEnds?: boolean
}

/** Carve a maze the way the app does, placement and braiding included. */
export function buildMaze(algorithm: MazeAlgorithm, options: BuildOptions = {}): MazeContext {
  const { cols = 12, rows = 10, seed = 1, braidRatio = 0, randomEnds = false } = options
  const rng = createRng(seed)
  const ctx = createContext(cols, rows, randomEnds ? randomEndpoints(cols, rows, rng) : undefined)
  drain(algorithm(ctx, rng))
  drain(braid(ctx, rng, braidRatio))
  return ctx
}

export function runSolver(solver: SolveAlgorithm, maze: MazeContext): SolveContext {
  const ctx = createSolveContext(maze)
  drain(solver(ctx), SOLVE_CAP)
  return ctx
}

/** Open walls, counted once each rather than once per side. */
export function edgeCount(grid: Grid): number {
  let sides = 0
  for (const links of grid.links) {
    for (const dir of DIRS) {
      if (links & dir.bit) sides++
    }
  }
  return sides / 2
}

/** Every opening has to be recorded on both of the cells it joins. */
export function linksAreSymmetric(grid: Grid): boolean {
  for (let i = 0; i < grid.links.length; i++) {
    for (const dir of DIRS) {
      if (!(grid.links[i] & dir.bit)) continue
      const x = (i % grid.cols) + dir.dx
      const y = Math.floor(i / grid.cols) + dir.dy
      // An opening that leads off the grid is broken on its own
      if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return false
      if (!(grid.links[y * grid.cols + x] & dir.opposite)) return false
    }
  }
  return true
}

/** How many cells can be walked to from `from`. */
export function reachableCount(grid: Grid, from = 0): number {
  const seen = new Uint8Array(grid.links.length)
  const stack = [from]
  const out: number[] = []
  seen[from] = 1
  let count = 0

  while (stack.length > 0) {
    const at = stack.pop() as number
    count++
    for (const next of openNeighbors(grid, at, out)) {
      if (seen[next]) continue
      seen[next] = 1
      stack.push(next)
    }
  }
  return count
}

/**
 * A maze is perfect when every cell is connected and there is no loop: a
 * spanning tree, so the openings number one fewer than the cells.
 */
export function isPerfect(grid: Grid): boolean {
  const size = grid.links.length
  return linksAreSymmetric(grid) && reachableCount(grid) === size && edgeCount(grid) === size - 1
}

export function everyCellSettled(ctx: MazeContext): boolean {
  return ctx.state.every((state) => state === DONE)
}

/** Length in cells of a shortest route, or -1 when there is none. */
export function shortestRouteLength(grid: Grid, start: number, goal: number): number {
  const dist = new Int32Array(grid.links.length).fill(-1)
  const queue = [start]
  const out: number[] = []
  dist[start] = 0

  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]
    if (at === goal) return dist[at] + 1
    for (const next of openNeighbors(grid, at, out)) {
      if (dist[next] >= 0) continue
      dist[next] = dist[at] + 1
      queue.push(next)
    }
  }
  return -1
}

/** True when each pair of neighbouring cells on the route has its wall down. */
export function routeIsWalkable(grid: Grid, route: readonly number[]): boolean {
  const out: number[] = []
  for (let i = 1; i < route.length; i++) {
    if (!openNeighbors(grid, route[i - 1], out).includes(route[i])) return false
  }
  return true
}
