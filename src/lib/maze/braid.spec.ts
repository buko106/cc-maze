import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { algorithms } from './algorithms'
import { braid, countDeadEnds } from './braid'
import { DIRS, createContext, link } from './grid'
import { createRng } from './rng'
import {
  buildMaze,
  drain,
  edgeCount,
  linksAreSymmetric,
  reachableCount,
  type BuildOptions,
} from './test-utils'
import type { MazeAlgorithm } from './types'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const sizeArb = fc.integer({ min: 5, max: 18 })
// Kept as twentieths so the ratios stay exact and read well in a counterexample
const ratioArb = fc.integer({ min: 0, max: 20 }).map((n) => n / 20)
const algorithmArb = fc.constantFrom(...algorithms.map((entry) => entry.run))

/** Carve a maze and hand back its rng, ready to be braided by hand. */
function carve(algorithm: MazeAlgorithm, options: BuildOptions = {}) {
  const { cols = 12, rows = 10, seed = 1 } = options
  const ctx = createContext(cols, rows)
  const rng = createRng(seed)
  drain(algorithm(ctx, rng))
  return { ctx, rng }
}

describe('countDeadEnds', () => {
  it('counts the cells with exactly one way out', () => {
    const { grid } = createContext(3, 1)
    const east = DIRS.find((dir) => dir.dx === 1)!
    expect(countDeadEnds(grid)).toBe(0) // walled in on every side, not a dead end
    link(grid, 0, east)
    expect(countDeadEnds(grid)).toBe(2) // both ends of the one corridor
    link(grid, 1, east)
    expect(countDeadEnds(grid)).toBe(2) // the middle now has two ways out
  })
})

describe('braid', () => {
  it('leaves a perfect maze alone at 0%', () => {
    fc.assert(
      fc.property(algorithmArb, sizeArb, sizeArb, seedArb, (algorithm, cols, rows, seed) => {
        const { ctx, rng } = carve(algorithm, { cols, rows, seed })
        const before = [...ctx.grid.links]
        drain(braid(ctx, rng, 0))
        expect([...ctx.grid.links]).toEqual(before)
      }),
    )
  })

  it('leaves no dead end at all at 100%', () => {
    fc.assert(
      fc.property(algorithmArb, sizeArb, sizeArb, seedArb, (algorithm, cols, rows, seed) => {
        const maze = buildMaze(algorithm, { cols, rows, seed, braidRatio: 1 })
        expect(countDeadEnds(maze.grid)).toBe(0)
      }),
    )
  })

  it('only ever opens walls, never closes one', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        (algorithm, cols, rows, seed, ratio) => {
          const plain = buildMaze(algorithm, { cols, rows, seed })
          const braided = buildMaze(algorithm, { cols, rows, seed, braidRatio: ratio })
          for (let i = 0; i < plain.grid.links.length; i++) {
            // Every opening the perfect maze had is still there
            expect(braided.grid.links[i] & plain.grid.links[i]).toBe(plain.grid.links[i])
          }
        },
      ),
    )
  })

  it('keeps the maze connected and its openings two-sided', () => {
    fc.assert(
      fc.property(
        algorithmArb,
        sizeArb,
        sizeArb,
        seedArb,
        ratioArb,
        (algorithm, cols, rows, seed, ratio) => {
          const maze = buildMaze(algorithm, { cols, rows, seed, braidRatio: ratio })
          expect(linksAreSymmetric(maze.grid)).toBe(true)
          expect(reachableCount(maze.grid)).toBe(cols * rows)
        },
      ),
    )
  })

  it('turns each of its steps into exactly one new opening', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, ratioArb, (cols, rows, seed, ratio) => {
        const { ctx, rng } = carve(algorithms[0].run, { cols, rows, seed })
        const before = edgeCount(ctx.grid)
        const steps = drain(braid(ctx, rng, ratio))
        expect(edgeCount(ctx.grid) - before).toBe(steps)
        expect(ctx.active).toEqual([])
      }),
    )
  })

  it('makes a maze that is no longer perfect once it has opened anything', () => {
    const { ctx, rng } = carve(algorithms[0].run, { cols: 16, rows: 12, seed: 5 })
    const size = 16 * 12
    expect(edgeCount(ctx.grid)).toBe(size - 1)
    const opened = drain(braid(ctx, rng, 0.5))
    expect(opened).toBeGreaterThan(0)
    expect(edgeCount(ctx.grid)).toBe(size - 1 + opened)
  })

  it('opens more the higher the ratio goes, never fewer', () => {
    fc.assert(
      fc.property(algorithmArb, seedArb, (algorithm, seed) => {
        const counts = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
          countDeadEnds(buildMaze(algorithm, { seed, braidRatio: ratio }).grid),
        )
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]).toBeLessThanOrEqual(counts[i - 1])
        }
        expect(counts[counts.length - 1]).toBe(0)
      }),
    )
  })

  it('spends fewer walls than there are dead ends, by pairing them up', () => {
    // Opening a dead end into another dead end settles both, so a full braid
    // costs noticeably fewer walls than the maze has dead ends. Fixed seeds, so
    // this is an exact figure rather than a statistical one: 0.68 as it stands,
    // against 0.81 for the same code picking a wall without looking first.
    let opened = 0
    let deadEnds = 0
    for (const entry of algorithms) {
      for (let seed = 0; seed < 8; seed++) {
        const { ctx, rng } = carve(entry.run, { cols: 16, rows: 12, seed })
        deadEnds += countDeadEnds(ctx.grid)
        opened += drain(braid(ctx, rng, 1))
      }
    }
    expect(opened / deadEnds).toBeLessThan(0.75)
  })

  it('braids the same way twice from the same seed', () => {
    fc.assert(
      fc.property(seedArb, ratioArb, (seed, ratio) => {
        const first = buildMaze(algorithms[0].run, { seed, braidRatio: ratio })
        const again = buildMaze(algorithms[0].run, { seed, braidRatio: ratio })
        expect([...again.grid.links]).toEqual([...first.grid.links])
      }),
    )
  })
})
