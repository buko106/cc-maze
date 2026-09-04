import { DIRS, link, neighbor, pick, shuffle, type Direction } from './grid'
import type { Grid, MazeContext } from './types'

/** How many ways lead out of this cell. A dead end has exactly one. */
function waysOut(links: number): number {
  let count = 0
  for (const dir of DIRS) {
    if (links & dir.bit) count++
  }
  return count
}

export function countDeadEnds(grid: Grid): number {
  let count = 0
  for (let i = 0; i < grid.links.length; i++) {
    if (waysOut(grid.links[i]) === 1) count++
  }
  return count
}

function deadEnds(grid: Grid): number[] {
  const cells: number[] = []
  for (let i = 0; i < grid.links.length; i++) {
    if (waysOut(grid.links[i]) === 1) cells.push(i)
  }
  return cells
}

/** Walls of a dead end that have a cell on the other side. */
function closedSides(grid: Grid, cell: number): Direction[] {
  return DIRS.filter((dir) => !(grid.links[cell] & dir.bit) && neighbor(grid, cell, dir) >= 0)
}

/**
 * Braiding: open dead ends up so the maze stops being perfect.
 *
 * Every generator here produces a perfect maze -- all cells connected, no loop
 * anywhere -- which means exactly one route joins any two cells. Knocking a
 * wall out of a dead end creates a loop, and from then on the maze has several
 * ways through, so the solvers stop agreeing on which route to take.
 *
 * ratio is the share of the dead ends to work through: 0 leaves the maze
 * perfect, 1 removes every last dead end. Opening one dead end into another
 * settles both at once, so the count actually drops a little faster than the
 * ratio suggests.
 *
 * Same shape as a generation algorithm -- mutate ctx, yield once per step -- so
 * the caller can chain it straight after one and animate the two as one run.
 */
export function* braid(
  ctx: MazeContext,
  rng: () => number,
  ratio: number,
): Generator<void, void, void> {
  if (ratio <= 0) return

  const { grid } = ctx
  const targets = shuffle(deadEnds(grid), rng)
  const wanted = Math.round(targets.length * Math.min(ratio, 1))

  for (let i = 0; i < wanted; i++) {
    const cell = targets[i]
    // An earlier opening may have already given this one a second way out
    if (waysOut(grid.links[cell]) !== 1) continue

    const sides = closedSides(grid, cell)
    if (sides.length === 0) continue
    // Prefer a neighbour that is a dead end too: one wall, two dead ends gone
    const paired = sides.filter((dir) => waysOut(grid.links[neighbor(grid, cell, dir)]) === 1)

    link(grid, cell, pick(paired.length > 0 ? paired : sides, rng))
    ctx.active = [cell]
    yield
  }

  ctx.active = []
}
