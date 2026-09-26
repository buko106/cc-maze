import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { algorithms, getAlgorithm } from './algorithms'
import { createContext } from './grid'
import { createRng } from './rng'
import { buildMaze, drain, edgeCount, everyCellSettled, isPerfect } from './test-utils'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
// The app's slider starts at 5; the upper bound only keeps the suite quick
const sizeArb = fc.integer({ min: 5, max: 20 })

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(algorithms.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
  it('carves a perfect maze, whatever the size and the seed', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const maze = buildMaze(entry.run, { cols, rows, seed })
        expect(isPerfect(maze.grid)).toBe(true)
      }),
    )
  })

  it('leaves every cell settled and nothing highlighted', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const maze = buildMaze(entry.run, { cols, rows, seed })
        expect(everyCellSettled(maze)).toBe(true)
        expect(maze.active).toEqual([])
      }),
    )
  })

  it('rebuilds the very same maze from the same seed', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const first = buildMaze(entry.run, { cols, rows, seed })
        const again = buildMaze(entry.run, { cols, rows, seed })
        expect([...again.grid.links]).toEqual([...first.grid.links])
      }),
    )
  })

  it('draws its randomness only from the rng it is handed', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('an algorithm reached for Math.random instead of its rng')
    })
    expect(() => buildMaze(entry.run, { cols: 12, rows: 9, seed: 7 })).not.toThrow()
  })

  it('finishes in a sane number of steps', () => {
    const cols = 14
    const rows = 11
    const ctx = createContext(cols, rows)
    const steps = drain(entry.run(ctx, createRng(3)))
    // How many steps a maze takes is the algorithm's own business -- Eller
    // settles a whole row at a time and takes fewer steps than there are cells,
    // Wilson wanders and takes several times as many. This is only a runaway
    // guard: the tightest bound that still holds for all of them is no bound.
    expect(steps).toBeGreaterThan(0)
    expect(steps).toBeLessThan(cols * rows * 60)
  })
})

describe('the registry', () => {
  it('has a unique id, a name and a description for every entry', () => {
    const ids = algorithms.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of algorithms) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the first entry for an id it does not know', () => {
    expect(getAlgorithm(algorithms[2].id)).toBe(algorithms[2])
    expect(getAlgorithm('no-such-algorithm')).toBe(algorithms[0])
  })
})

describe('across the algorithms', () => {
  it('every one of them spans the grid with the same number of openings', () => {
    // Different characters, same spanning tree: cells - 1 openings, always
    const mazes = algorithms.map((entry) => buildMaze(entry.run, { cols: 16, rows: 12, seed: 99 }))
    for (const maze of mazes) {
      expect(edgeCount(maze.grid)).toBe(16 * 12 - 1)
    }
  })

  it('and none of them agrees with another on what the maze looks like', () => {
    const shapes = algorithms.map((entry) =>
      [...buildMaze(entry.run, { cols: 16, rows: 12, seed: 99 }).grid.links].join(),
    )
    expect(new Set(shapes).size).toBe(algorithms.length)
  })
})
