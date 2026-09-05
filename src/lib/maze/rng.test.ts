import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createRng, randomSeed } from './rng'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })

function draw(seed: number, count: number): number[] {
  const rng = createRng(seed)
  return Array.from({ length: count }, () => rng())
}

describe('createRng', () => {
  it('replays the same stream for the same seed', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(draw(seed, 20)).toEqual(draw(seed, 20))
      }),
    )
  })

  it('stays inside [0, 1)', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        for (const value of draw(seed, 50)) {
          expect(value).toBeGreaterThanOrEqual(0)
          expect(value).toBeLessThan(1)
        }
      }),
    )
  })

  it('gives neighbouring seeds unrelated streams', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xfffffffe }), (seed) => {
        expect(draw(seed, 10)).not.toEqual(draw(seed + 1, 10))
      }),
    )
  })

  /**
   * Pins mulberry32 itself. Every maze in the app is a function of the seed, so
   * changing the generator silently would move every documented figure with it.
   */
  it('is still mulberry32', () => {
    expect(draw(42, 4).map((value) => Number(value.toFixed(10)))).toEqual([
      0.6011037519, 0.448290559, 0.8524657935, 0.6697340414,
    ])
  })
})

describe('randomSeed', () => {
  it('returns a 32-bit unsigned integer', () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('feeds createRng a seed it accepts', () => {
    const seed = randomSeed()
    expect(draw(seed, 5)).toEqual(draw(seed, 5))
  })
})
