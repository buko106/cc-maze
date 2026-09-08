import fc from 'fast-check'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { algorithms } from '../maze/algorithms'
import { placements } from '../maze/placements'
import { solvers } from '../maze/solvers'
import { speeds } from '../speeds'
import { choice, integer, type SettingsSchema } from './fields'
import { COLS, ROWS, SETTINGS, type Settings } from './schema'
import {
  SETTINGS_KEY,
  SETTINGS_VERSION,
  loadSettings,
  readSettings,
  saveSettings,
  writeSettings,
  type StorageLike,
} from './storage'

/**
 * A stand-in for localStorage, which the node test environment does not have.
 * `fail` makes it behave like storage that has been turned off or filled up.
 */
function fakeStorage(initial?: string, fail = false): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      if (fail) throw new Error('storage is blocked')
      return key === SETTINGS_KEY ? this.value : null
    },
    setItem(key, value) {
      if (fail) throw new Error('quota exceeded')
      if (key === SETTINGS_KEY) this.value = value
    },
  }
}

function stored(values: Record<string, unknown>, version = SETTINGS_VERSION): string {
  return JSON.stringify({ version, values })
}

/** A schema small enough to reason about, standing in for the app's own. */
const TOY = {
  mode: choice(['a', 'b'], 'a'),
  size: integer({ min: 5, max: 20 }, 10),
} satisfies SettingsSchema

const TOY_DEFAULTS = { mode: 'a', size: 10 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('choice', () => {
  it('takes an id that is on the list', () => {
    expect(choice(['a', 'b'], 'a').parse('b')).toBe('b')
  })

  it('rejects anything else, so the fallback is used', () => {
    const field = choice(['a', 'b'], 'a')
    for (const raw of ['c', '', 0, null, undefined, {}, ['a']]) {
      expect(field.parse(raw)).toBeUndefined()
    }
  })
})

describe('integer', () => {
  const field = integer({ min: 5, max: 20 }, 10)

  it('takes a whole number inside the range', () => {
    expect(field.parse(7)).toBe(7)
  })

  /** So that narrowing a range later keeps the choice rather than resetting it. */
  it('pulls a value outside the range to the nearest end', () => {
    expect(field.parse(90)).toBe(20)
    expect(field.parse(-3)).toBe(5)
  })

  it('rounds a fraction', () => {
    expect(field.parse(12.7)).toBe(13)
  })

  it('rejects anything that is not a finite number', () => {
    for (const raw of ['7', NaN, Infinity, null, undefined, {}, [7]]) {
      expect(field.parse(raw)).toBeUndefined()
    }
  })
})

describe('readSettings', () => {
  it('gives every field its fallback when nothing is stored', () => {
    expect(readSettings(TOY, fakeStorage())).toEqual(TOY_DEFAULTS)
  })

  it('restores what was stored', () => {
    const storage = fakeStorage(stored({ mode: 'b', size: 15 }))
    expect(readSettings(TOY, storage)).toEqual({ mode: 'b', size: 15 })
  })

  /**
   * The point of parsing field by field: one unusable value costs that setting
   * and nothing else.
   */
  it('falls back only on the field it cannot read', () => {
    const storage = fakeStorage(stored({ mode: 'nonsense', size: 15 }))
    expect(readSettings(TOY, storage)).toEqual({ mode: 'a', size: 15 })
  })

  /** What a payload written before a setting existed looks like. */
  it('fills in a field the stored payload has never heard of', () => {
    const storage = fakeStorage(stored({ mode: 'b' }))
    expect(readSettings(TOY, storage)).toEqual({ mode: 'b', size: 10 })
  })

  /** And what one written after a setting was dropped looks like. */
  it('ignores a stored field the schema no longer has', () => {
    const storage = fakeStorage(stored({ mode: 'b', size: 15, retired: 'gone' }))
    expect(readSettings(TOY, storage)).toEqual({ mode: 'b', size: 15 })
  })

  it('ignores a payload written under another version', () => {
    const storage = fakeStorage(stored({ mode: 'b', size: 15 }, SETTINGS_VERSION + 1))
    expect(readSettings(TOY, storage)).toEqual(TOY_DEFAULTS)
  })

  it('ignores anything that is not the shape it wrote', () => {
    for (const raw of ['', 'not json', 'null', '[]', '{}', '{"version":1}', '{"values":{}}']) {
      expect(readSettings(TOY, fakeStorage(raw))).toEqual(TOY_DEFAULTS)
    }
  })

  it('carries on when storage refuses to be read', () => {
    expect(readSettings(TOY, fakeStorage(undefined, true))).toEqual(TOY_DEFAULTS)
    expect(readSettings(TOY, null)).toEqual(TOY_DEFAULTS)
  })

  /**
   * Whatever ends up in storage -- another build, a hand edit, a truncated
   * write -- the app has to start with a value it can use for every setting.
   */
  it('always returns a full set of usable settings', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (raw) => {
        const settings = readSettings(SETTINGS, fakeStorage(raw))
        for (const [key, field] of Object.entries(SETTINGS)) {
          const value = settings[key as keyof Settings]
          expect(field.parse(value)).toBe(value)
        }
      }),
    )
  })
})

describe('writeSettings', () => {
  it('comes back out of readSettings unchanged', () => {
    const storage = fakeStorage()
    const settings = { mode: 'b', size: 15 }
    writeSettings(TOY, settings, storage)
    expect(readSettings(TOY, storage)).toEqual(settings)
  })

  it('stores the version alongside the values', () => {
    const storage = fakeStorage()
    writeSettings(TOY, TOY_DEFAULTS, storage)
    expect(JSON.parse(storage.value ?? '')).toEqual({
      version: SETTINGS_VERSION,
      values: TOY_DEFAULTS,
    })
  })

  it('writes only what the schema knows about', () => {
    const storage = fakeStorage()
    writeSettings(TOY, { ...TOY_DEFAULTS, stray: 'ignored' } as typeof TOY_DEFAULTS, storage)
    expect(JSON.parse(storage.value ?? '').values).toEqual(TOY_DEFAULTS)
  })

  it('carries on when storage refuses to be written to', () => {
    expect(() => writeSettings(TOY, TOY_DEFAULTS, fakeStorage(undefined, true))).not.toThrow()
    expect(() => writeSettings(TOY, TOY_DEFAULTS, null)).not.toThrow()
  })
})

describe('the app schema', () => {
  /**
   * A fallback that its own field would reject would be handed straight to the
   * UI: it is what a first visit and every unreadable value get.
   */
  it('has a fallback every field accepts', () => {
    for (const field of Object.values(SETTINGS)) {
      expect(field.parse(field.fallback)).toBe(field.fallback)
    }
  })

  it('defaults to the first entry of each registry, at a size the sliders can reach', () => {
    const settings = readSettings(SETTINGS, null)
    expect(settings.algorithmId).toBe(algorithms[0].id)
    expect(settings.solverId).toBe(solvers[0].id)
    expect(settings.placementId).toBe(placements[0].id)
    expect(speeds.map((entry) => entry.id)).toContain(settings.speedId)
    expect(settings.cols).toBeGreaterThanOrEqual(COLS.min)
    expect(settings.cols).toBeLessThanOrEqual(COLS.max)
    expect(settings.rows).toBeGreaterThanOrEqual(ROWS.min)
    expect(settings.rows).toBeLessThanOrEqual(ROWS.max)
  })

  it('survives an id that was dropped from a registry', () => {
    const storage = fakeStorage(stored({ algorithmId: 'retired', solverId: solvers[1].id }))
    const settings = readSettings(SETTINGS, storage)
    expect(settings.algorithmId).toBe(algorithms[0].id)
    expect(settings.solverId).toBe(solvers[1].id)
  })
})

describe('loadSettings and saveSettings', () => {
  it('round-trip through localStorage', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    const settings: Settings = {
      ...readSettings(SETTINGS, null),
      cols: 42,
      solverId: solvers[1].id,
    }
    saveSettings(settings)
    expect(storage.value).not.toBeNull()
    expect(loadSettings()).toEqual(settings)
  })

  it('fall back to the defaults where there is no storage at all', () => {
    expect(loadSettings()).toEqual(readSettings(SETTINGS, null))
    expect(() => saveSettings(loadSettings())).not.toThrow()
  })
})
