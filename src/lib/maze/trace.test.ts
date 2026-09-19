import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { algorithms } from './algorithms'
import {
  DIRS,
  createContext,
  createSolveContext,
  link,
  neighbor,
  openNeighbors,
  type Direction,
} from './grid'
import { bfs } from './solvers/bfs'
import { dfs } from './solvers/dfs'
import { wallFollower } from './solvers/wallfollower'
import { SOLVE_CAP, buildMaze, drain, routeIsWalkable, runSolver } from './test-utils'
import { begin, dragTo, press, step } from './trace'
import { SEARCHED, type MazeAlgorithm, type MazeContext, type SolveContext } from './types'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const sizeArb = fc.integer({ min: 5, max: 16 })
// Zero included: everything here has to hold on a perfect maze and a braided one alike
const ratioArb = fc.integer({ min: 0, max: 20 }).map((n) => n / 20)
const algorithmArb = fc.constantFrom(...algorithms.map((entry) => entry.run))
const endsArb = fc.boolean()

/** Any maze the app can build: every generator, loops or not, S and G anywhere. */
function build(
  algorithm: MazeAlgorithm,
  cols: number,
  rows: number,
  seed: number,
  braidRatio: number,
  randomEnds: boolean,
): MazeContext {
  return buildMaze(algorithm, { cols, rows, seed, braidRatio, randomEnds })
}

/**
 * What has to hold after any input at all: the line is a route through the maze
 * from S, and the count on the panel is exactly what has been painted.
 */
function expectHonest(ctx: SolveContext): void {
  const painted = ctx.state.filter((state) => state === SEARCHED).length
  expect(ctx.expanded).toBe(painted)

  const { path } = ctx
  if (path.length === 0) {
    expect(painted).toBe(0)
    return
  }
  expect(path[0]).toBe(ctx.start)
  expect(routeIsWalkable(ctx.grid, path)).toBe(true)
  expect(new Set(path).size).toBe(path.length)
  expect(path.every((cell) => ctx.state[cell] === SEARCHED)).toBe(true)

  const tip = path[path.length - 1]
  expect(ctx.found).toBe(tip === ctx.goal)
  expect(ctx.active).toEqual(ctx.found ? [] : [tip])
}

/** Everything a refused input must leave alone. */
function snapshot(ctx: SolveContext): string {
  return JSON.stringify([ctx.path, [...ctx.state], ctx.expanded, ctx.found, ctx.active])
}

function directionTo(maze: MazeContext, from: number, to: number): Direction {
  const dir = DIRS.find((entry) => neighbor(maze.grid, from, entry) === to)
  if (!dir) throw new Error(`${to} does not touch ${from}`)
  return dir
}

function tipOf(ctx: SolveContext): number {
  return ctx.path.length > 0 ? ctx.path[ctx.path.length - 1] : ctx.start
}

describe('following a route', () => {
  it('ends up with exactly the route it was dragged along, one move per cell', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path
          const ctx = createSolveContext(maze)

          // Putting the pen down on S is not a move yet
          expect(press(ctx, maze.entrance)).toBe(0)
          let moves = 0
          for (const cell of route.slice(1)) moves += dragTo(ctx, cell)

          expectHonest(ctx)
          expect(ctx.found).toBe(true)
          expect(ctx.path).toEqual(route)
          expect(moves).toBe(route.length - 1)
          expect(ctx.expanded).toBe(route.length)
        },
      ),
    )
  })

  it('takes a tap on the cell after the tip as a step', () => {
    fc.assert(
      fc.property(algorithmArb, sizeArb, sizeArb, seedArb, (algorithm, cols, rows, seed) => {
        const maze = build(algorithm, cols, rows, seed, 0, false)
        const route = runSolver(bfs, maze).path
        const ctx = createSolveContext(maze)

        for (const cell of route) expect(press(ctx, cell)).toBe(cell === maze.entrance ? 0 : 1)
        expectHonest(ctx)
        expect(ctx.path).toEqual(route)
      }),
    )
  })

  /** A quick flick, or a corner cut on the diagonal, skips the cell in between. */
  it('fills in a cell the pen skipped', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path
          const ctx = createSolveContext(maze)

          begin(ctx)
          for (let i = 2; i < route.length; i += 2) expect(dragTo(ctx, route[i])).toBe(2)
          dragTo(ctx, route[route.length - 1])

          expectHonest(ctx)
          expect(ctx.found).toBe(true)
          // A loop can offer a second cell in between, so only the length is
          // certain once the maze is braided
          expect(ctx.path).toHaveLength(route.length)
          if (ratio === 0) expect(ctx.path).toEqual(route)
        },
      ),
    )
  })

  it('walks the same route on the arrow keys', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path
          const ctx = createSolveContext(maze)

          for (let i = 1; i < route.length; i++) {
            expect(step(ctx, directionTo(maze, route[i - 1], route[i]))).toBe(1)
          }
          expectHonest(ctx)
          expect(ctx.path).toEqual(route)
        },
      ),
    )
  })

  it('stops on the goal when that is the cell in between', () => {
    // 0 - 1 - 2 in a row, with the goal in the middle
    const maze = createContext(3, 1, { entrance: 0, exit: 1, entranceOpening: 0, exitOpening: 0 })
    const east = DIRS[1]
    link(maze.grid, 0, east)
    link(maze.grid, 1, east)
    const ctx = createSolveContext(maze)

    begin(ctx)
    expect(dragTo(ctx, 2)).toBe(1)
    expect(ctx.path).toEqual([0, 1])
    expect(ctx.found).toBe(true)
    expectHonest(ctx)
  })
})

describe('walls', () => {
  it('never lets the line through one, however the pen tries', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        fc.integer({ min: 0, max: 60 }),
        (algorithm, cols, rows, seed, ratio, randomEnds, wander) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const ctx = createSolveContext(maze)
          const out: number[] = []

          // Wander off somewhere first, so the walls get tried from all over the maze
          begin(ctx)
          for (let i = 0; i < wander && !ctx.found; i++) {
            const ways = openNeighbors(maze.grid, tipOf(ctx), out)
            dragTo(ctx, ways[(seed + i) % ways.length])
          }
          if (ctx.found) return

          const tip = tipOf(ctx)
          for (const dir of DIRS) {
            const next = neighbor(maze.grid, tip, dir)
            if (next < 0 || maze.grid.links[tip] & dir.bit) continue

            const before = snapshot(ctx)
            expect(dragTo(ctx, next)).toBe(0)
            expect(step(ctx, dir)).toBe(0)
            // Pressing the line itself is always allowed, even across a wall
            if (!ctx.path.includes(next)) expect(press(ctx, next)).toBeNull()
            expect(snapshot(ctx)).toBe(before)
          }
        },
      ),
    )
  })

  it('will not start the line anywhere out of reach of S', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const ctx = createSolveContext(maze)
          const before = snapshot(ctx)
          const x = maze.entrance % cols
          const y = Math.floor(maze.entrance / cols)

          for (let cell = 0; cell < cols * rows; cell++) {
            const far = Math.abs((cell % cols) - x) + Math.abs(Math.floor(cell / cols) - y) > 2
            if (far) expect(press(ctx, cell)).toBeNull()
          }
          expect(snapshot(ctx)).toBe(before)
        },
      ),
    )
  })
})

describe('taking the line back', () => {
  it('cuts it back to wherever it is pressed, and keeps counting what it saw', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        fc.nat(),
        (algorithm, cols, rows, seed, ratio, randomEnds, pick) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path
          const ctx = createSolveContext(maze)

          // Everything but the goal, which would settle the line for good
          begin(ctx)
          for (const cell of route.slice(1, -1)) dragTo(ctx, cell)
          const seen = ctx.expanded
          const at = pick % (route.length - 1)
          const tip = route.length - 2

          expect(press(ctx, route[at])).toBe(at === tip ? 0 : 1)
          expect(ctx.path).toEqual(route.slice(0, at + 1))
          expect(ctx.expanded).toBe(seen)
          expectHonest(ctx)
        },
      ),
    )
  })

  it('shortens it a cell at a time on the way back', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path.slice(0, -1)
          const ctx = createSolveContext(maze)

          begin(ctx)
          for (const cell of route.slice(1)) dragTo(ctx, cell)
          const seen = ctx.expanded

          for (let i = route.length - 2; i >= 0; i--) {
            expect(dragTo(ctx, route[i])).toBe(1)
            expect(ctx.path).toEqual(route.slice(0, i + 1))
          }
          expect(ctx.expanded).toBe(seen)
          expectHonest(ctx)
        },
      ),
    )
  })

  it('cuts off a loop the pen closes, so no cell is on the line twice', () => {
    // 0 - 1 - 2
    // |   |   |
    // 3 - 4   5    a loop through 0, 1, 4 and 3, and the way on to the goal at 5
    const maze = createContext(3, 2, { entrance: 0, exit: 5, entranceOpening: 0, exitOpening: 0 })
    const [, east, south] = DIRS
    link(maze.grid, 0, east)
    link(maze.grid, 1, east)
    link(maze.grid, 0, south)
    link(maze.grid, 1, south)
    link(maze.grid, 2, south)
    link(maze.grid, 3, east)
    const ctx = createSolveContext(maze)

    begin(ctx)
    for (const cell of [1, 4, 3]) expect(dragTo(ctx, cell)).toBe(1)
    // Round the loop and back onto the start
    expect(dragTo(ctx, 0)).toBe(1)
    expect(ctx.path).toEqual([0])
    expect(ctx.expanded).toBe(4)
    expectHonest(ctx)
  })
})

describe('at the goal', () => {
  it('stays exactly as it is, whatever the pen does next', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const route = runSolver(bfs, maze).path
          const ctx = createSolveContext(maze)
          for (const cell of route) press(ctx, cell)
          expect(ctx.found).toBe(true)

          const before = snapshot(ctx)
          for (let cell = 0; cell < cols * rows; cell++) {
            expect(press(ctx, cell)).toBeNull()
            expect(dragTo(ctx, cell)).toBe(0)
          }
          for (const dir of DIRS) expect(step(ctx, dir)).toBe(0)
          begin(ctx)
          expect(snapshot(ctx)).toBe(before)
        },
      ),
    )
  })
})

describe('a random scribble', () => {
  const commandArb = fc.record({
    kind: fc.constantFrom('press', 'drag', 'step'),
    // Mostly near the tip, where a hand on the maze would be
    dx: fc.integer({ min: -3, max: 3 }),
    dy: fc.integer({ min: -3, max: 3 }),
    dir: fc.integer({ min: 0, max: 3 }),
  })

  it('leaves an honest line after every single input', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        fc.array(commandArb, { maxLength: 300 }),
        (algorithm, cols, rows, seed, ratio, randomEnds, commands) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const ctx = createSolveContext(maze)

          for (const { kind, dx, dy, dir } of commands) {
            const tip = tipOf(ctx)
            const x = Math.min(cols - 1, Math.max(0, (tip % cols) + dx))
            const y = Math.min(rows - 1, Math.max(0, Math.floor(tip / cols) + dy))
            const target = y * cols + x

            if (kind === 'press') press(ctx, target)
            else if (kind === 'step') expect(step(ctx, DIRS[dir])).toBeLessThanOrEqual(1)
            // Never more than the one cell in between: the line does not find its own way
            else expect(dragTo(ctx, target)).toBeLessThanOrEqual(2)
            expectHonest(ctx)
          }
        },
      ),
    )
  })
})

/**
 * The reason the line lives in a SolveContext: walked the way an algorithm
 * walks, a person has to come out with the very same numbers, or the panel
 * would be comparing two different things.
 */
describe('against the searches', () => {
  it('counts exactly like depth-first search when walked in the same order', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        endsArb,
        (algorithm, cols, rows, seed, ratio, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, ratio, randomEnds)
          const search = createSolveContext(maze)
          const searchSteps = drain(dfs(search), SOLVE_CAP)

          const ctx = createSolveContext(maze)
          const out: number[] = []
          let moves = 0
          begin(ctx)
          for (let i = 0; i < SOLVE_CAP && !ctx.found; i++) {
            // Into the first cell not seen yet, as dfs.ts picks it, or back where it came from
            const tip = tipOf(ctx)
            const next = openNeighbors(maze.grid, tip, out).find((cell) => !ctx.state[cell])
            moves += dragTo(ctx, next ?? ctx.path[ctx.path.length - 2])
          }

          expect(ctx.path).toEqual(search.path)
          expect(ctx.expanded).toBe(search.expanded)
          expect(moves).toBe(searchSteps)
        },
      ),
    )
  })

  it('counts exactly like the wall follower on a perfect maze', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        endsArb,
        (algorithm, cols, rows, seed, randomEnds) => {
          const maze = build(algorithm, cols, rows, seed, 0, randomEnds)
          const search = createSolveContext(maze)
          const searchSteps = drain(wallFollower(search), SOLVE_CAP)

          // Right, straight on, left, back -- starting off southwards, as wallfollower.ts does
          const turns = [1, 0, 3, 2]
          let facing = 2
          const ctx = createSolveContext(maze)
          let moves = 0
          begin(ctx)
          for (let i = 0; i < SOLVE_CAP && !ctx.found; i++) {
            const tip = tipOf(ctx)
            const turn = turns.find((t) => maze.grid.links[tip] & DIRS[(facing + t) % 4].bit)
            if (turn === undefined) break
            facing = (facing + turn) % 4
            moves += dragTo(ctx, neighbor(maze.grid, tip, DIRS[facing]))
          }

          expect(ctx.found).toBe(true)
          expect(ctx.path).toEqual(search.path)
          expect(ctx.expanded).toBe(search.expanded)
          expect(moves).toBe(searchSteps)
        },
      ),
    )
  })
})
