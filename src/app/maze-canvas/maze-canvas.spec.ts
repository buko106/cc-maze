import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MazeSession } from '../maze-session'
import { SettingsStore } from '../settings-store'
import { MazeCanvas } from './maze-canvas'

/** Stands in for the layout, which jsdom does not do: the test says how big the room is. */
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.last = this
  }
  observe(): void {}
  disconnect(): void {}
  resize(width: number, height: number): void {
    const entry = { contentRect: { width, height } } as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

/**
 * A finished 10x10 maze in a 404px square: 40px cells behind a 2px line, so
 * the grid starts 1px in from the canvas edge.
 */
async function setup({ byHand = false } = {}) {
  const store = TestBed.inject(SettingsStore)
  store.settings.update((settings) => ({
    ...settings,
    cols: 10,
    rows: 10,
    speedId: 'instant',
    solverId: byHand ? 'by-hand' : 'dfs',
  }))
  const session = TestBed.inject(MazeSession)
  session.start()
  const fixture = TestBed.createComponent(MazeCanvas)
  await fixture.whenStable()
  FakeResizeObserver.last?.resize(404, 404)
  await fixture.whenStable()
  const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return { fixture, session, canvas }
}

/** The pointer over the middle of a cell, counted in cells from the top left. */
function at(col: number, row: number, type: string): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 7,
    button: 0,
    clientX: 1 + 40 * (col + 0.5),
    clientY: 1 + 40 * (row + 0.5),
    bubbles: true,
  })
}

describe('MazeCanvas', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    // jsdom has no 2D context; sizing the canvas is as far as drawing gets
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fits the maze into the room the layout gives it', async () => {
    const { canvas } = await setup()
    expect(canvas.style.width).toBe('402px')
    expect(canvas.style.height).toBe('402px')
    expect(canvas.getAttribute('role')).toBe('img')
    expect(canvas.hasAttribute('tabindex')).toBe(false)
  })

  it('takes the focus and the pen while the route is traced by hand', async () => {
    const { canvas } = await setup({ byHand: true })
    expect(canvas.getAttribute('role')).toBe('application')
    expect(canvas.tabIndex).toBe(0)
    expect(canvas.classList).toContain('traceable')
  })

  it('draws again when the maze is swapped for one of another size', async () => {
    const { fixture, session, canvas } = await setup()
    TestBed.inject(SettingsStore).settings.update((settings) => ({ ...settings, cols: 5 }))
    session.reset()
    await fixture.whenStable()
    // 5x10 in 404x404: the rows decide, so the cells stay at 40px
    expect(canvas.style.width).toBe('202px')
  })

  it('ignores the pen until the route is to be traced by hand', async () => {
    const { session, canvas } = await setup()
    const press = vi.spyOn(session, 'pressCell')
    canvas.dispatchEvent(at(0, 0, 'pointerdown'))
    expect(press).not.toHaveBeenCalled()
  })

  it('passes every cell a quick flick goes over, in order', async () => {
    const { session, canvas } = await setup({ byHand: true })
    const press = vi.spyOn(session, 'pressCell').mockReturnValue(true)
    const drag = vi.spyOn(session, 'dragCell').mockReturnValue()

    canvas.dispatchEvent(at(2, 3, 'pointerdown'))
    expect(press).toHaveBeenCalledWith(32)
    canvas.dispatchEvent(at(5, 3, 'pointermove'))
    canvas.dispatchEvent(at(5, 5, 'pointermove'))
    expect(drag.mock.calls.map(([cell]) => cell)).toEqual([33, 34, 35, 45, 55])

    canvas.dispatchEvent(at(5, 5, 'pointerup'))
    canvas.dispatchEvent(at(6, 5, 'pointermove'))
    expect(drag).toHaveBeenCalledTimes(5)
  })

  it('does not follow a drag the session turned down', async () => {
    const { session, canvas } = await setup({ byHand: true })
    vi.spyOn(session, 'pressCell').mockReturnValue(false)
    const drag = vi.spyOn(session, 'dragCell')

    canvas.dispatchEvent(at(2, 3, 'pointerdown'))
    canvas.dispatchEvent(at(5, 3, 'pointermove'))
    expect(drag).not.toHaveBeenCalled()
  })
})
