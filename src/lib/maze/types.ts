/**
 * A maze is stored as "which directions are open for each cell".
 * This is lighter than keeping a list of walls, and it stays consistent as long
 * as a passage sets one bit on each of the two neighbouring cells.
 */
export const N = 1
export const E = 2
export const S = 4
export const W = 8

export interface Grid {
  readonly cols: number
  readonly rows: number
  /** Cell index (y * cols + x) -> bit mask of the directions that are open */
  readonly links: Uint8Array
}

/** Per-cell progress. The renderer picks its colour from this. */
export const UNVISITED = 0
/** Touches a passage, but is not connected to it yet */
export const FRONTIER = 1
/** Sits on the path currently being carved */
export const TRAIL = 2
/** Settled passage */
export const DONE = 3

export interface MazeContext {
  readonly grid: Grid
  /** Cell index -> UNVISITED | FRONTIER | TRAIL | DONE */
  readonly state: Uint8Array
  /** Start cell. The outer wall is left open here. */
  readonly entrance: number
  /** Goal cell. */
  readonly exit: number
  /** Cells this step is looking at. The renderer highlights them. */
  active: number[]
}

/**
 * A generator mutates ctx in place and yields once per step.
 *
 * Animating is just advancing it a little on every frame, and generating the
 * whole maze at once is just draining it until done -- so one implementation
 * covers both and the algorithms need no animation-specific branches.
 */
export type MazeAlgorithm = (ctx: MazeContext, rng: () => number) => Generator<void, void, void>

/**
 * Per-cell progress of a solver. Kept apart from the generation state above so
 * the two layers can be drawn on top of each other without their colours
 * meaning two different things.
 */
export const UNSEEN = 0
/** Discovered, but not expanded yet */
export const FRINGE = 1
/** Expanded: every neighbour of this cell has been looked at */
export const SEARCHED = 2

export interface SolveContext {
  readonly grid: Grid
  /** Cell index -> UNSEEN | FRINGE | SEARCHED */
  readonly state: Uint8Array
  readonly start: number
  readonly goal: number
  /**
   * The route being followed, from start to the head, as cell indices.
   * Once the goal is reached this is the finished route.
   */
  path: number[]
  /** Cells this step is looking at. The renderer highlights them. */
  active: number[]
  /** How many cells have been expanded. This is what the search actually cost. */
  expanded: number
  found: boolean
}

/**
 * Same shape as MazeAlgorithm: mutate ctx in place, yield once per step.
 * No rng, so re-solving the same maze twice always looks the same and the
 * algorithms can be compared side by side.
 */
export type SolveAlgorithm = (ctx: SolveContext) => Generator<void, void, void>
