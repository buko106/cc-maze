import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createContext } from './grid'
import { getPlacement, placements } from './placements'
import { createRng } from './rng'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const sizeArb = fc.integer({ min: 5, max: 20 })

describe('the registry', () => {
  it('has a unique id, a name and a description for every entry', () => {
    const ids = placements.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of placements) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('falls back to the first entry for an id it does not know', () => {
    expect(getPlacement(placements[1].id)).toBe(placements[1])
    expect(getPlacement('no-such-placement')).toBe(placements[0])
  })

  it('leaves the ends where a fresh context puts them, for the default entry', () => {
    const fresh = createContext(9, 7)
    const placed = placements[0].place(9, 7, createRng(1))
    expect(placed.entrance).toBe(fresh.entrance)
    expect(placed.exit).toBe(fresh.exit)
  })
})

describe.each(placements.map((entry) => [entry.id, entry] as const))('%s', (_id, entry) => {
  it('gives a maze two distinct ends, wherever it puts them', () => {
    fc.assert(
      fc.property(sizeArb, sizeArb, seedArb, (cols, rows, seed) => {
        const ctx = createContext(cols, rows, entry.place(cols, rows, createRng(seed)))
        expect(ctx.entrance).not.toBe(ctx.exit)
        expect(ctx.entrance).toBeLessThan(cols * rows)
        expect(ctx.exit).toBeLessThan(cols * rows)
      }),
    )
  })
})
