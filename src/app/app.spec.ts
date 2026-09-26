import { TestBed, type ComponentFixture } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { E } from '../lib/maze/types'
import { SETTINGS_KEY } from '../lib/settings/storage'
import { App } from './app'
import { MazeSession } from './maze-session'
import { SettingsStore } from './settings-store'

/** jsdom lays nothing out, so there is never a size to report. */
class InertResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

/**
 * The page as a visitor who last left it on the given settings would open it,
 * at 一気に unless told otherwise, so a finished maze is one render away.
 */
async function open(values: Record<string, unknown> = {}) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      version: 1,
      values: { speedId: 'instant', solveSpeedId: 'instant', ...values },
    }),
  )
  const fixture = TestBed.createComponent(App)
  await fixture.whenStable()
  return {
    fixture,
    page: fixture.nativeElement as HTMLElement,
    session: TestBed.inject(MazeSession),
    store: TestBed.inject(SettingsStore),
  }
}

function button(page: HTMLElement, label: string): HTMLButtonElement {
  const found = [...page.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
  if (!found) throw new Error(`no button labelled ${label}`)
  return found
}

function status(page: HTMLElement): string[] {
  return [...page.querySelectorAll('app-status-board dd')].map((dd) => dd.textContent?.trim() ?? '')
}

function radio(page: HTMLElement, label: string): HTMLInputElement {
  const found = [...page.querySelectorAll('label')].find((l) => l.textContent?.includes(label))
  const input = found?.querySelector('input')
  if (!input) throw new Error(`no radio labelled ${label}`)
  return input
}

async function press(fixture: ComponentFixture<App>, key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  await fixture.whenStable()
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('ResizeObserver', InertResizeObserver)
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('opens on a maze being built', async () => {
    const { page } = await open()
    expect(page.querySelector('h1')?.textContent).toBe('迷路ジェネレーター')
    expect(status(page)[0]).toMatch(/^完成 \/ [\d,]+ ステップ$/)
    expect(button(page, '生成し直す')).toBeTruthy()
  })

  it('solves the maze on S and builds a new one on G', async () => {
    const { fixture, page, session } = await open({ solverId: 'bfs' })
    await press(fixture, 's')
    expect(status(page)[2]).toMatch(/^到達 \//)
    expect(button(page, '解き直す').disabled).toBe(false)

    const maze = session.maze()
    await press(fixture, 'G')
    expect(session.maze()).not.toBe(maze)
    expect(status(page)[2]).toBe('未探索 / 0 ステップ')
  })

  it('leaves Ctrl+S and a held key to the browser', async () => {
    const { fixture, session } = await open()
    await press(fixture, 's', { ctrlKey: true })
    await press(fixture, 's', { repeat: true })
    expect(session.solveState()).toBe('idle')
  })

  it('keeps 解く and クリア off until there is something to solve and clear', async () => {
    const { fixture, page, session } = await open()
    session.reset()
    await fixture.whenStable()
    expect(button(page, '解く').disabled).toBe(true)
    expect(button(page, 'クリア').disabled).toBe(true)
    expect(button(page, 'リセット').disabled).toBe(true)
  })

  it('writes a picked method into the settings and builds the maze again', async () => {
    const { fixture, session, store, page } = await open()
    const maze = session.maze()
    radio(page, 'Kruskal 法').click()
    await fixture.whenStable()
    expect(store.settings().algorithmId).toBe('kruskal')
    expect(session.maze()).not.toBe(maze)
    expect(radio(page, 'Kruskal 法').closest('label')?.classList).toContain('selected')
  })

  it('bounds the sliders by the ranges the settings are stored in', async () => {
    const { page } = await open()
    const sliders = [...page.querySelectorAll<HTMLInputElement>('input[type=range]')]
    expect(sliders.map((s) => [s.min, s.max])).toEqual([
      ['5', '90'],
      ['5', '70'],
      ['0', '100'],
    ])
  })

  it('turns the search speed off while the route is traced by hand', async () => {
    const { fixture, page } = await open()
    const speeds = () => [...page.querySelectorAll<HTMLInputElement>('.speed:last-child input')]
    expect(speeds().every((input) => !input.disabled)).toBe(true)
    radio(page, '自分で解く').click()
    await fixture.whenStable()
    expect(speeds().every((input) => input.disabled)).toBe(true)
  })

  it('hands the keyboard to the maze when tracing starts', async () => {
    const { fixture, page, session } = await open({ solverId: 'by-hand', placementId: 'corners' })
    button(page, '解く').click()
    await fixture.whenStable()
    const canvas = page.querySelector('canvas')
    expect(document.activeElement).toBe(canvas)
    expect(canvas?.getAttribute('role')).toBe('application')

    // A corner start always has a way out, to the east or else to the south
    const key = session.maze().grid.links[session.maze().entrance] & E ? 'ArrowRight' : 'ArrowDown'
    canvas?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await fixture.whenStable()
    expect(status(page)[2]).toBe('探索中 / 1 ステップ')
  })
})
