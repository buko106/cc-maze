import { DIRS, neighbor, type Direction } from './grid'
import { SEARCHED, UNSEEN, type Grid, type SolveContext } from './types'

/*
 * Solving by hand. The person drags a line out of the start, and the functions
 * here keep it an honest route: it only ever runs through open passages, one
 * cell at a time, and it never finds its own way round a corner.
 *
 * The line is kept in the same SolveContext the searches fill in. It is the
 * path, and every cell it has ever passed through stays SEARCHED after the line
 * is pulled back off it. So a hand-drawn attempt is painted and counted exactly
 * like depth-first search, and "cells looked at" means the same thing for a
 * person as it does for an algorithm.
 *
 * Any route that gets to the goal counts. In a perfect maze there is only the
 * one; once the maze has loops the line may come out longer than the shortest,
 * and comparing its length with what BFS finds shows by how much.
 *
 * Each function returns how many moves the pen made -- the step counter for a
 * person -- and 0 when nothing changed. Cutting the line back counts as one.
 */

/** Put the pen down on the start. Does nothing once the line exists. */
export function begin(ctx: SolveContext): void {
  if (ctx.path.length > 0) return
  ctx.path = [ctx.start]
  mark(ctx, ctx.start)
  settle(ctx)
}

/**
 * The pen went down on a cell. Anywhere on the line cuts the line back to
 * there, so a wrong turn is undone in one go; within reach of the tip it takes
 * the pen there. Returns the moves made, or null when the pen landed somewhere
 * the line cannot go, which should not start a drag.
 */
export function press(ctx: SolveContext, cell: number): number | null {
  if (ctx.found) return null
  if (ctx.path.length === 0) {
    // Nothing to pick up yet, so the pen has to start out from the start
    if (!routeTo(ctx.grid, ctx.start, cell)) return null
    begin(ctx)
  }

  const onLine = ctx.path.lastIndexOf(cell)
  if (onLine === ctx.path.length - 1) return 0
  if (onLine >= 0) {
    ctx.path.length = onLine + 1
    settle(ctx)
    return 1
  }

  const moves = dragTo(ctx, cell)
  return moves > 0 ? moves : null
}

/**
 * The pen, while down, moved onto a cell. The line follows when that cell is
 * within reach of the tip; otherwise it stays put and waits for the pen to come
 * back to it.
 */
export function dragTo(ctx: SolveContext, cell: number): number {
  if (ctx.found || ctx.path.length === 0) return 0
  const route = routeTo(ctx.grid, ctx.path[ctx.path.length - 1], cell)
  if (!route) return 0

  let moves = 0
  for (const next of route) {
    moveTo(ctx, next)
    moves++
    // The cell in between may have been the goal
    if (ctx.found) break
  }
  return moves
}

/** An arrow key: one step in that direction, unless a wall is in the way. */
export function step(ctx: SolveContext, dir: Direction): number {
  if (ctx.found) return 0
  begin(ctx)
  const at = ctx.path[ctx.path.length - 1]
  if (!(ctx.grid.links[at] & dir.bit)) return 0
  moveTo(ctx, neighbor(ctx.grid, at, dir))
  return 1
}

/**
 * Take the pen onto a neighbouring cell. Stepping onto the line pulls the line
 * back to there, and any other step lengthens it. In a perfect maze the only
 * way back onto the line is the cell the pen has just come from; with loops the
 * pen can also come round onto an earlier stretch of it, and cutting the loop
 * off there keeps the line a plain route that never visits a cell twice.
 */
function moveTo(ctx: SolveContext, cell: number): void {
  const onLine = ctx.path.lastIndexOf(cell)
  if (onLine >= 0) {
    ctx.path.length = onLine + 1
  } else {
    ctx.path.push(cell)
    mark(ctx, cell)
  }
  settle(ctx)
}

/** Count a cell the first time the line reaches it. It stays counted from then on. */
function mark(ctx: SolveContext, cell: number): void {
  if (ctx.state[cell] !== UNSEEN) return
  ctx.state[cell] = SEARCHED
  ctx.expanded++
}

/** Highlight the tip of the pen, or finish once it is on the goal. */
function settle(ctx: SolveContext): void {
  const tip = ctx.path[ctx.path.length - 1]
  ctx.found = tip === ctx.goal
  ctx.active = ctx.found ? [] : [tip]
}

/**
 * The cells to walk through from one cell to another, not counting the first.
 * A neighbour is a single step. A cell two steps off -- the pen cut a corner,
 * or moved faster than the events came in -- also goes through the cell in
 * between, as long as that way is open. Null for anything else: walls in the
 * way, or too far to tell which way the person meant to go.
 */
function routeTo(grid: Grid, from: number, to: number): number[] | null {
  if (from === to) return []
  if (passable(grid, from, to)) return [to]
  for (const dir of DIRS) {
    if (!(grid.links[from] & dir.bit)) continue
    const middle = neighbor(grid, from, dir)
    if (passable(grid, middle, to)) return [middle, to]
  }
  return null
}

/** Whether two cells touch and the wall between them is down. */
function passable(grid: Grid, from: number, to: number): boolean {
  for (const dir of DIRS) {
    if (neighbor(grid, from, dir) === to) return (grid.links[from] & dir.bit) !== 0
  }
  return false
}
