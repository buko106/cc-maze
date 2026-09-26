import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_KEY } from '../lib/settings/storage'
import { SettingsStore } from './settings-store'

function stored(): unknown {
  const raw = localStorage.getItem(SETTINGS_KEY)
  return raw === null ? null : JSON.parse(raw).values
}

describe('SettingsStore', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  /** A visitor who touches nothing must keep getting whatever the defaults become. */
  it('writes nothing until a setting is changed', () => {
    TestBed.inject(SettingsStore)
    TestBed.tick()
    expect(stored()).toBeNull()
  })

  it('writes the settings once one of them changes', () => {
    const store = TestBed.inject(SettingsStore)
    TestBed.tick()
    store.settings.update((settings) => ({ ...settings, cols: 42 }))
    TestBed.tick()
    expect(stored()).toEqual(store.settings())
  })

  it('starts from what was stored on the last visit', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, values: { solverId: 'bfs' } }))
    const store = TestBed.inject(SettingsStore)
    expect(store.settings().solverId).toBe('bfs')
    expect(store.solver().name).toBe('幅優先探索 (BFS)')
    expect(store.byHand()).toBe(false)
  })

  it('knows solving by hand has nothing to run', () => {
    const store = TestBed.inject(SettingsStore)
    store.settings.update((settings) => ({ ...settings, solverId: 'by-hand' }))
    expect(store.byHand()).toBe(true)
  })
})
