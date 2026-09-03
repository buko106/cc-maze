import {
  N,
  E,
  S,
  W,
  UNSEEN,
  UNVISITED,
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

export function createContext(cols: number, rows: number): MazeContext {
  const size = cols * rows
  const grid: Grid = { cols, rows, links: new Uint8Array(size) }
  return {
    grid,
    state: new Uint8Array(size).fill(UNVISITED),
    // Start top-left, goal bottom-right. In a perfect maze any pair of cells
    // is joined by exactly one path, so the choice only affects the looks.
    entrance: 0,
    exit: size - 1,
    active: [],
  }
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
