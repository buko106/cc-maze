import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { algorithms } from './algorithms'
import { DIRS, link } from './grid'
import { getSolver, solvers } from './solvers'
import { wallFollower } from './solvers/wallfollower'
import {
  SOLVE_CAP,
  buildMaze,
  drain,
  routeIsWalkable,
  runSolver,
  shortestRouteLength,
  type BuildOptions,
} from './test-utils'
import { SEARCHED, SEARCHED_BACK, UNSEEN, type Grid, type SolveContext } from './types'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const sizeArb = fc.integer({ min: 5, max: 16 })
const ratioArb = fc.integer({ min: 1, max: 20 }).map((n) => n / 20)
const algorithmArb = fc.constantFrom(...algorithms.map((entry) => entry.run))
// Both placements the app offers: S and G in their corners, or dropped anywhere
const endsArb = fc.boolean()

/** The methods that are meant to come back with a shortest route, loops or not. */
const OPTIMAL = ['bfs', 'astar', 'bidirectional']

const maze = (options: BuildOptions = {}) => buildMaze(algorithms[0].run, options)

describe.each(solvers.map((entry) => [entry.id, entry] as const))('%s', (id, entry) => {
  it('walks a perfect maze from S to G, wherever the two are', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        endsArb,
        (algorithm, cols, rows, seed, randomEnds) => {
          const ctx = buildMaze(algorithm, { cols, rows, seed, randomEnds })
          const result = runSolver(entry.run, ctx)

          expect(result.found).toBe(true)
          expect(result.path[0]).toBe(ctx.entrance)
          expect(result.path[result.path.length - 1]).toBe(ctx.exit)
          expect(routeIsWalkable(ctx.grid, result.path)).toBe(true)
          expect(result.expanded).toBeGreaterThan(0)
          expect(result.active).toEqual([])
        },
      ),
    )
  })

  it('finds the one route a perfect maze has, whichever method it is', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        endsArb,
        (algorithm, cols, rows, seed, randomEnds) => {
          const ctx = buildMaze(algorithm, { cols, rows, seed, randomEnds })
          const result = runSolver(entry.run, ctx)
          // Exactly one path joins two cells of a perfect maze, so every method
          // has to come back with the same one -- this is what the app claims
          expect(result.path.length).toBe(shortestRouteLength(ctx.grid, ctx.entrance, ctx.exit))
          expect(new Set(result.path).size).toBe(result.path.length)
        },
      ),
    )
  })

  it('never looks at a cell twice over', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, ratioArb, (cols, rows, seed, ratio) => {
        const ctx = maze({ cols, rows, seed, braidRatio: ratio })
        const result = runSolver(entry.run, ctx)
        // No lower bound: a fully braided maze has no dead end for the filler
        // to plug, and it comes back having touched nothing at all
        expect(result.expanded).toBeGreaterThanOrEqual(0)
        expect(result.expanded).toBeLessThanOrEqual(cols * rows)
        // The count is what the panel shows, so it has to match what was
        // painted: expanding one cell twice would quietly inflate it
        const painted = [...result.state].filter(
          (state) => state === SEARCHED || state === SEARCHED_BACK,
        ).length
        expect(result.expanded).toBe(painted)
      }),
    )
  })

  it('searches without randomness: the same maze gives the same run', () => {
    fc.assert(
      fc.property(seedArb, ratioArb, (seed, ratio) => {
        const ctx = maze({ seed, braidRatio: ratio })
        const first = runSolver(entry.run, ctx)
        const again = runSolver(entry.run, ctx)
        expect(again.path).toEqual(first.path)
        expect(again.expanded).toBe(first.expanded)
        expect(again.found).toBe(first.found)
      }),
    )
  })

  it('terminates on a braided maze, and only claims the goal when it got there', () => {
    fc.assert(
      fc.property(
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (cols, rows, seed, ratio, randomEnds) => {
          // runSolver throws rather than hanging if the search runs away
          const ctx = maze({ cols, rows, seed, braidRatio: ratio, randomEnds })
          const result = runSolver(entry.run, ctx)

          if (result.found) {
            expect(result.path[result.path.length - 1]).toBe(ctx.exit)
            expect(routeIsWalkable(ctx.grid, result.path)).toBe(true)
            // The wall follower is the one method whose route keeps the loops it
            // walked -- its warning says so. Every other route stays a plain line.
            if (id !== 'wall-follower') {
              expect(new Set(result.path).size).toBe(result.path.length)
            }
          } else {
            // The panel shows 到達できず for this, so it had better be true
            expect(result.path[result.path.length - 1]).not.toBe(ctx.exit)
          }
          expect(result.active).toEqual([])
        },
      ),
    )
  })

  if (OPTIMAL.includes(id)) {
    it('returns a shortest route even once the maze has loops', () => {
      fc.assert(
        fc.property(
          sizeArb,
          sizeArb,
          seedArb,
          ratioArb,
          endsArb,
          (cols, rows, seed, ratio, randomEnds) => {
            const ctx = maze({ cols, rows, seed, braidRatio: ratio, randomEnds })
            const result = runSolver(entry.run, ctx)
            expect(result.found).toBe(true)
            expect(result.path.length).toBe(shortestRouteLength(ctx.grid, ctx.entrance, ctx.exit))
          },
        ),
      )
    })
  }

  if (entry.braidNote === undefined) {
    it('gets there on a braided maze too, which is why it carries no warning', () => {
      fc.assert(
        fc.property(
          sizeArb,
          sizeArb,
          seedArb,
          ratioArb,
          endsArb,
          (cols, rows, seed, ratio, randomEnds) => {
            const result = runSolver(
              entry.run,
              maze({ cols, rows, seed, braidRatio: ratio, randomEnds }),
            )
            expect(result.found).toBe(true)
          },
        ),
      )
    })
  }
})

/**
 * Both of these used to run for ever on a maze with loops: the wall follower
 * circling an island of walls, the filler walking a loop it could not plug.
 * runSolver gives up after half a million steps, so a return to that failure
 * shows up as a failing test rather than as a hung suite.
 */
describe('the methods that lean on a perfect maze', () => {
  const perfectOnly = solvers.filter((entry) => entry.braidNote !== undefined)

  it('are the wall follower and dead-end filling', () => {
    expect(perfectOnly.map((entry) => entry.id)).toEqual(['wall-follower', 'dead-end'])
    for (const entry of perfectOnly) {
      expect(entry.braidNote?.length).toBeGreaterThan(0)
    }
  })

  /**
   * The exact failure the wall follower's guard is there for, cut down to a
   * maze whose steps can be counted. With S and G in their corners the follower
   * hugs the outer wall and is bound to pass the goal, so the app only walks
   * into this once the ends are dropped at random: here the goal sits behind an
   * island of walls, and the follower laps the ring for ever unless it notices
   * that it is repeating itself.
   */
  it('the wall follower laps a wall island once and then gives up', () => {
    const cols = 5
    const rows = 5
    const grid: Grid = { cols, rows, links: new Uint8Array(cols * rows) }
    const east = DIRS.find((dir) => dir.dx === 1)!
    const south = DIRS.find((dir) => dir.dy === 1)!

    // The rim of the grid, joined up into one ring
    for (let c = 0; c < cols - 1; c++) {
      link(grid, c, east)
      link(grid, (rows - 1) * cols + c, east)
    }
    for (let r = 0; r < rows - 1; r++) {
      link(grid, r * cols, south)
      link(grid, r * cols + cols - 1, south)
    }
    // A corridor off the ring, reaching the middle cell
    link(grid, 10, east)
    link(grid, 11, east)

    const ctx: SolveContext = {
      grid,
      state: new Uint8Array(cols * rows).fill(UNSEEN),
      start: 0,
      goal: 12,
      path: [],
      active: [],
      expanded: 0,
      found: false,
    }
    // Throws instead of hanging if the guard is gone
    const steps = drain(wallFollower(ctx), SOLVE_CAP)

    expect(ctx.found).toBe(false)
    expect(ctx.path).not.toContain(ctx.goal)
    // One lap of the sixteen cells on the rim, then back where it started
    expect(steps).toBe(16)
  })

  it.each(perfectOnly.map((entry) => [entry.id, entry] as const))(
    '%s stops even when every dead end is gone',
    (_id, entry) => {
      fc.assert(
        fc.property(
          algorithmArb,
          sizeArb,
          sizeArb,
          seedArb,
          endsArb,
          (algorithm, cols, rows, seed, randomEnds) => {
            const ctx = buildMaze(algorithm, { cols, rows, seed, braidRatio: 1, randomEnds })
            const result = runSolver(entry.run, ctx)
            expect(result.active).toEqual([])
          },
        ),
      )
    },
  )
})

describe('the registry', () => {
  it('has a unique id, a name and a description for every entry', () => {
    const ids = solvers.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of solvers) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the first entry for an id it does not know', () => {
    expect(getSolver(solvers[3].id)).toBe(solvers[3])
    expect(getSolver('no-such-solver')).toBe(solvers[0])
  })
})
