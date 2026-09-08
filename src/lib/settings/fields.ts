/**
 * One persisted setting: the value to start from, and how to read a stored one
 * back.
 *
 * Storage hands back `unknown`. What is in there may have been written by an
 * older build, hand-edited from the devtools, or truncated, so every field
 * carries its own parser and falls back on its own. A value that no longer
 * makes sense costs that one setting and never the rest of them.
 */
export interface SettingField<T> {
  /** Used when nothing is stored, or when what is stored cannot be read back. */
  readonly fallback: T
  /** Returns undefined when the stored value cannot be used. */
  readonly parse: (raw: unknown) => T | undefined
}

/**
 * A whole schema. T only ever appears in output positions of SettingField, so a
 * field of any type is assignable to SettingField<unknown> and one record can
 * hold a mix of them.
 */
export type SettingsSchema = Record<string, SettingField<unknown>>

/** The plain object a schema describes: one property per field, typed by it. */
export type SettingsOf<S extends SettingsSchema> = {
  -readonly [K in keyof S]: S[K] extends SettingField<infer T> ? T : never
}

export interface Range {
  readonly min: number
  readonly max: number
}

/** One id out of a registry. An id that is not on the list falls back. */
export function choice(options: readonly string[], fallback: string): SettingField<string> {
  return {
    fallback,
    parse: (raw) => (typeof raw === 'string' && options.includes(raw) ? raw : undefined),
  }
}

/**
 * A whole number inside a range. Values outside it are pulled to the nearest
 * end rather than thrown away: if a range is ever narrowed, a maze of 90
 * columns should come back as the new widest one, not as the default.
 */
export function integer(range: Range, fallback: number): SettingField<number> {
  return {
    fallback,
    parse: (raw) =>
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.min(range.max, Math.max(range.min, Math.round(raw)))
        : undefined,
  }
}
