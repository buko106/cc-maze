import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DIRS,
  createContext,
  createSolveContext,
  link,
  neighbor,
  openNeighbors,
  pick,
  shuffle,
  tracePath,
} from './grid'
import { createRng } from './rng'
import { UNSEEN, UNVISITED } from './types'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })

describe('createContext', () => {
  it('starts as solid rock with the way in and out at opposite corners', () => {
    const ctx = createContext(7, 5)
    expect(ctx.grid.links).toHaveLength(35)
    expect([...ctx.grid.links].every((links) => links === 0)).toBe(true)
    expect([...ctx.state].every((state) => state === UNVISITED)).toBe(true)
    expect(ctx.entrance).toBe(0)
    expect(ctx.exit).toBe(34)
    expect(ctx.active).toEqual([])
  })
})

describe('neighbor', () => {
  it('falls off the grid rather than wrapping round the edge', () => {
    const { grid } = createContext(4, 3)
    const north = DIRS.find((dir) => dir.dy === -1)!
    const west = DIRS.find((dir) => dir.dx === -1)!
    // Leftmost cell of the second row: west of it is off the grid, not the row above
    expect(neighbor(grid, 4, west)).toBe(-1)
    expect(neighbor(grid, 0, north)).toBe(-1)
    expect(neighbor(grid, 4, north)).toBe(0)
  })

  it('always returns a cell one step away, or nothing', () => {
    const { grid } = createContext(6, 4)
    for (let i = 0; i < grid.links.length; i++) {
      for (const dir of DIRS) {
        const other = neighbor(grid, i, dir)
        if (other < 0) continue
        expect(other % grid.cols).toBe((i % grid.cols) + dir.dx)
        expect(Math.floor(other / grid.cols)).toBe(Math.floor(i / grid.cols) + dir.dy)
      }
    }
  })
})

describe('link', () => {
  it('takes the wall down on both sides at once', () => {
    const { grid } = createContext(4, 4)
    const east = DIRS.find((dir) => dir.dx === 1)!
    expect(link(grid, 5, east)).toBe(6)
    expect(grid.links[5] & east.bit).toBeTruthy()
    expect(grid.links[6] & east.opposite).toBeTruthy()
  })

  it('leaves the grid alone at the border', () => {
    const { grid } = createContext(4, 4)
    const west = DIRS.find((dir) => dir.dx === -1)!
    expect(link(grid, 0, west)).toBe(-1)
    expect([...grid.links].every((links) => links === 0)).toBe(true)
  })
})

describe('shuffle', () => {
  it('keeps every item, in place', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const items = Array.from({ length: 30 }, (_, i) => i)
        const shuffled = shuffle(items, createRng(seed))
        expect(shuffled).toBe(items)
        expect([...shuffled].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i))
      }),
    )
  })

  it('orders the same way for the same seed', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const order = (s: number) =>
          shuffle(
            Array.from({ length: 30 }, (_, i) => i),
            createRng(s),
          )
        expect(order(seed)).toEqual(order(seed))
      }),
    )
  })
})

describe('pick', () => {
  it('only ever returns a member of the list', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const items = ['a', 'b', 'c', 'd']
        const rng = createRng(seed)
        for (let i = 0; i < 25; i++) {
          expect(items).toContain(pick(items, rng))
        }
      }),
    )
  })
})

describe('openNeighbors', () => {
  it('lists the cells whose wall is down, reusing the array it is handed', () => {
    const { grid } = createContext(3, 3)
    const east = DIRS.find((dir) => dir.dx === 1)!
    const south = DIRS.find((dir) => dir.dy === 1)!
    link(grid, 4, east)
    link(grid, 4, south)

    const out: number[] = ['stale' as unknown as number]
    const found = openNeighbors(grid, 4, out)
    expect(found).toBe(out)
    expect([...found].sort((a, b) => a - b)).toEqual([5, 7])
    expect(openNeighbors(grid, 0, out)).toEqual([])
  })
})

describe('tracePath', () => {
  it('reads the parent links back into a route that starts at the root', () => {
    const parent = Int32Array.from([-1, 0, 1, 2])
    expect(tracePath(parent, 3)).toEqual([0, 1, 2, 3])
    expect(tracePath(parent, 0)).toEqual([0])
  })
})

describe('createSolveContext', () => {
  it('searches the maze it was given, from its entrance to its exit', () => {
    const maze = createContext(5, 4)
    const solve = createSolveContext(maze)
    expect(solve.grid).toBe(maze.grid)
    expect(solve.start).toBe(maze.entrance)
    expect(solve.goal).toBe(maze.exit)
    expect([...solve.state].every((state) => state === UNSEEN)).toBe(true)
    expect(solve.found).toBe(false)
    expect(solve.path).toEqual([])
    expect(solve.expanded).toBe(0)
  })
})
