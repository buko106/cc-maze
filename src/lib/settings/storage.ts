import type { SettingsOf, SettingsSchema } from './fields'
import { SETTINGS, type Settings } from './schema'

/** Namespaced, because a page on the same origin may keep its own things here. */
export const SETTINGS_KEY = 'cc-maze:settings'

/**
 * Bumped only when the meaning of a stored value changes -- say if `cols` came
 * to mean something other than a count of cells, and reading an old one back
 * would restore a setting nobody chose. Adding, removing or renaming a setting
 * does not need it: unknown keys are dropped and missing ones take their
 * fallback, so an old payload keeps whatever still applies.
 */
export const SETTINGS_VERSION = 1

/** The slice of the Storage API this needs, so a test can hand it a stand-in. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

interface Payload {
  readonly version: number
  readonly values: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRaw(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(SETTINGS_KEY) ?? null
  } catch {
    // Storage that refuses to be read (Safari in private mode, cookies turned
    // off) simply means there is nothing to restore
    return null
  }
}

/** Whatever is in storage, as a bag of unknowns. Anything unreadable reads as empty. */
function readValues(storage: StorageLike | null): Record<string, unknown> {
  const raw = readRaw(storage)
  if (raw === null) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const payload: Record<string, unknown> =
    isRecord(parsed) && parsed.version === SETTINGS_VERSION ? parsed : {}
  return isRecord(payload.values) ? payload.values : {}
}

/**
 * Restores the settings a schema describes. Every field is read on its own, so
 * one unusable value never costs the others, and the result is always complete.
 */
export function readSettings<S extends SettingsSchema>(
  schema: S,
  storage: StorageLike | null,
): SettingsOf<S> {
  const values = readValues(storage)
  const settings = {} as SettingsOf<S>
  for (const key of Object.keys(schema) as (keyof S & string)[]) {
    const field = schema[key]
    settings[key] = (field.parse(values[key]) ?? field.fallback) as SettingsOf<S>[typeof key]
  }
  return settings
}

export function writeSettings<S extends SettingsSchema>(
  schema: S,
  settings: SettingsOf<S>,
  storage: StorageLike | null,
): void {
  // Copied out field by field, both to leave behind anything the schema does not
  // know about and so that a caller holding these in a reactive proxy touches
  // every field it has -- including the ones added after this was written
  const values: Record<string, unknown> = {}
  for (const key of Object.keys(schema) as (keyof S & string)[]) values[key] = settings[key]
  const payload: Payload = { version: SETTINGS_VERSION, values }
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(payload))
  } catch {
    // Out of quota, or storage turned off. Remembering the settings is a
    // convenience; failing to is not worth interrupting the app over.
  }
}

/** Missing under the tests' node environment, and throws where storage is blocked. */
function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadSettings(): Settings {
  return readSettings(SETTINGS, browserStorage())
}

export function saveSettings(settings: Settings): void {
  writeSettings(SETTINGS, settings, browserStorage())
}
