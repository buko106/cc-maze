import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DIRS,
  cornerEndpoints,
  createContext,
  createSolveContext,
  link,
  neighbor,
  openNeighbors,
  pick,
  randomEndpoints,
  shuffle,
  tracePath,
} from './grid'
import { createRng } from './rng'
import { N, S, UNSEEN, UNVISITED, type Endpoints } from './types'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
// The app's slider starts at 5; a couple of thin grids come along for the ride
const sizeArb = fc.integer({ min: 2, max: 20 })

afterEach(() => {
  vi.restoreAllMocks()
})

/** Steps between two cells, the way the placement measures how far apart they are. */
function manhattan(cols: number, a: number, b: number): number {
  return Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols))
}

/** The opening has to face off the grid, or it would be an inner wall missing. */
function facesOutward(cols: number, rows: number, cell: number, opening: number): boolean {
  if (opening === 0) return true
  const dir = DIRS.find((entry) => entry.bit === opening)
  if (!dir) return false
  const x = (cell % cols) + dir.dx
  const y = Math.floor(cell / cols) + dir.dy
  return x < 0 || y < 0 || x >= cols || y >= rows
}

describe('createContext', () => {
  it('starts as solid rock with the way in and out at opposite corners', () => {
    const ctx = createContext(7, 5)
    expect(ctx.grid.links).toHaveLength(35)
    expect([...ctx.grid.links].every((links) => links === 0)).toBe(true)
    expect([...ctx.state].every((state) => state === UNVISITED)).toBe(true)
    expect(ctx.entrance).toBe(0)
    expect(ctx.exit).toBe(34)
    expect(ctx.entranceOpening).toBe(N)
    expect(ctx.exitOpening).toBe(S)
    expect(ctx.active).toEqual([])
  })

  it('puts the ends wherever it is told to', () => {
    const endpoints: Endpoints = { entrance: 12, exit: 3, entranceOpening: 0, exitOpening: N }
    const ctx = createContext(7, 5, endpoints)
    expect(ctx.entrance).toBe(12)
    expect(ctx.exit).toBe(3)
    expect(ctx.entranceOpening).toBe(0)
    expect(ctx.exitOpening).toBe(N)
  })
})

describe('cornerEndpoints', () => {
  it('opens the wall above the top-left corner and below the bottom-right one', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, (cols, rows) => {
        const ends = cornerEndpoints(cols, rows)
        expect(ends).toEqual({
          entrance: 0,
          exit: cols * rows - 1,
          entranceOpening: N,
          exitOpening: S,
        })
        expect(facesOutward(cols, rows, ends.entrance, ends.entranceOpening)).toBe(true)
        expect(facesOutward(cols, rows, ends.exit, ends.exitOpening)).toBe(true)
      }),
    )
  })
})

describe('randomEndpoints', () => {
  it('keeps both ends on the grid and apart', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const size = cols * rows
        const { entrance, exit } = randomEndpoints(cols, rows, createRng(seed))
        expect(entrance).toBeGreaterThanOrEqual(0)
        expect(entrance).toBeLessThan(size)
        expect(exit).toBeGreaterThanOrEqual(0)
        expect(exit).toBeLessThan(size)
        expect(exit).not.toBe(entrance)

        // Half of however far the entrance could possibly reach: the goal is
        // never round the corner from the start, whatever the shape of the grid
        let reach = 0
        for (let i = 0; i < size; i++) reach = Math.max(reach, manhattan(cols, entrance, i))
        expect(manhattan(cols, entrance, exit) * 2).toBeGreaterThanOrEqual(reach)
      }),
    )
  })

  it('opens the outer wall only where an end sits on the border', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const ends = randomEndpoints(cols, rows, createRng(seed))
        for (const [cell, opening] of [
          [ends.entrance, ends.entranceOpening],
          [ends.exit, ends.exitOpening],
        ]) {
          expect(facesOutward(cols, rows, cell, opening)).toBe(true)
          const x = cell % cols
          const y = Math.floor(cell / cols)
          const onBorder = x === 0 || y === 0 || x === cols - 1 || y === rows - 1
          // A cell in the middle of the maze has no outer wall to open
          expect(opening === 0).toBe(!onBorder)
        }
      }),
    )
  })

  it('places the same pair again from the same seed', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        expect(randomEndpoints(cols, rows, createRng(seed))).toEqual(
          randomEndpoints(cols, rows, createRng(seed)),
        )
      }),
    )
  })

  it('moves them about: the corners are not the only answer', () => {
    const placements = new Set(
      Array.from({ length: 50 }, (_, seed) => {
        const ends = randomEndpoints(20, 15, createRng(seed))
        return `${ends.entrance}-${ends.exit}`
      }),
    )
    expect(placements.size).toBeGreaterThan(40)
  })

  it('draws its randomness only from the rng it is handed', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('the placement reached for Math.random instead of its rng')
    })
    expect(() => randomEndpoints(12, 9, createRng(7))).not.toThrow()
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
