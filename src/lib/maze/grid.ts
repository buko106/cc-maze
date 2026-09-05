import {
  N,
  E,
  S,
  W,
  UNSEEN,
  UNVISITED,
  type Endpoints,
  type Grid,
  type MazeContext,
  type SolveContext,
} from './types'

export interface Direction {
  readonly bit: number
  readonly dx: number
  readonly dy: number
  /** The bit that points back here, as seen from the neighbouring cell */
  readonly opposite: number
}

export const DIRS: readonly Direction[] = [
  { bit: N, dx: 0, dy: -1, opposite: S },
  { bit: E, dx: 1, dy: 0, opposite: W },
  { bit: S, dx: 0, dy: 1, opposite: N },
  { bit: W, dx: -1, dy: 0, opposite: E },
]

export function createContext(
  cols: number,
  rows: number,
  endpoints: Endpoints = cornerEndpoints(cols, rows),
): MazeContext {
  const size = cols * rows
  const grid: Grid = { cols, rows, links: new Uint8Array(size) }
  return {
    grid,
    state: new Uint8Array(size).fill(UNVISITED),
    ...endpoints,
    active: [],
  }
}

/**
 * Start top-left, goal bottom-right, with the way in above the one and the way
 * out below the other. Both ends are on the outer wall and as far apart as the
 * grid allows, which is what the wall follower leans on.
 */
export function cornerEndpoints(cols: number, rows: number): Endpoints {
  return { entrance: 0, exit: cols * rows - 1, entranceOpening: N, exitOpening: S }
}

/**
 * Both ends dropped anywhere on the grid, only held apart: the goal is drawn
 * from the cells at least half of the entrance's reach away, so the two never
 * come out side by side. An end that happens to land on the border opens the
 * outer wall on one of the sides it faces, the way the corners do; one in the
 * middle is simply a marked cell with the outer wall closed all around.
 */
export function randomEndpoints(cols: number, rows: number, rng: () => number): Endpoints {
  const size = cols * rows
  const entrance = Math.floor(rng() * size)
  const x = entrance % cols
  const y = Math.floor(entrance / cols)
  const distance = (cell: number): number =>
    Math.abs((cell % cols) - x) + Math.abs(Math.floor(cell / cols) - y)

  // The cell farthest from anywhere is always a corner
  const reach = Math.max(x, cols - 1 - x) + Math.max(y, rows - 1 - y)
  const far: number[] = []
  for (let i = 0; i < size; i++) {
    if (i !== entrance && distance(i) * 2 >= reach) far.push(i)
  }
  // Whichever corner sets the reach clears half of it, so the list is empty
  // only on a grid of a single cell, which has nowhere else to put the goal.
  const exit = far.length > 0 ? pick(far, rng) : entrance

  return {
    entrance,
    exit,
    entranceOpening: borderSide(cols, rows, entrance, rng),
    exitOpening: borderSide(cols, rows, exit, rng),
  }
}

/** One of the outer sides the cell faces, or 0 when it is not on the border. */
function borderSide(cols: number, rows: number, cell: number, rng: () => number): number {
  const x = cell % cols
  const y = Math.floor(cell / cols)
  const sides: number[] = []
  if (y === 0) sides.push(N)
  if (x === cols - 1) sides.push(E)
  if (y === rows - 1) sides.push(S)
  if (x === 0) sides.push(W)
  return sides.length > 0 ? pick(sides, rng) : 0
}

/** Index of the neighbour in direction dir, or -1 when it falls off the grid. */
export function neighbor(grid: Grid, index: number, dir: Direction): number {
  const x = (index % grid.cols) + dir.dx
  const y = Math.floor(index / grid.cols) + dir.dy
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) return -1
  return y * grid.cols + x
}

/** Knock down the wall between index and its neighbour in direction dir. Returns that neighbour. */
export function link(grid: Grid, index: number, dir: Direction): number {
  const other = neighbor(grid, index, dir)
  if (other < 0) return -1
  grid.links[index] |= dir.bit
  grid.links[other] |= dir.opposite
  return other
}

/** Fisher-Yates. Takes an rng, so the same seed always produces the same order. */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]
}

/** A fresh search over an already generated maze. */
export function createSolveContext(maze: MazeContext): SolveContext {
  return {
    grid: maze.grid,
    state: new Uint8Array(maze.grid.links.length).fill(UNSEEN),
    start: maze.entrance,
    goal: maze.exit,
    path: [],
    active: [],
    expanded: 0,
    found: false,
  }
}

/**
 * Neighbours that can be walked to from index, i.e. the wall between them is
 * already down. Writes into out and returns it, so a solver can reuse one array
 * instead of allocating on every step.
 */
export function openNeighbors(grid: Grid, index: number, out: number[]): number[] {
  out.length = 0
  for (const dir of DIRS) {
    if (!(grid.links[index] & dir.bit)) continue
    const next = neighbor(grid, index, dir)
    if (next >= 0) out.push(next)
  }
  return out
}

/** Walk the parent links back from a cell to build the route that reaches it. */
export function tracePath(parent: Int32Array, cell: number): number[] {
  const path: number[] = []
  for (let at = cell; at >= 0; at = parent[at]) path.push(at)
  return path.reverse()
}
