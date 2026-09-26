import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DIRS } from '../lib/maze/grid'
import { bfs } from '../lib/maze/solvers/bfs'
import { runSolver } from '../lib/maze/test-utils'
import type { Settings } from '../lib/settings/schema'
import { MazeSession } from './maze-session'
import { SettingsStore } from './settings-store'

/**
 * A session over the given settings, with its reactions to later changes
 * already armed. Anything not given runs at 一気に, so a test that does not
 * care about the animation never has to wait on a frame.
 */
function setup(overrides: Partial<Settings> = {}) {
  const store = TestBed.inject(SettingsStore)
  store.settings.update((settings) => ({
    ...settings,
    speedId: 'instant',
    solveSpeedId: 'instant',
    ...overrides,
  }))
  const session = TestBed.inject(MazeSession)
  TestBed.tick()
  const change = (patch: Partial<Settings>) => {
    store.settings.update((settings) => ({ ...settings, ...patch }))
    TestBed.tick()
  }
  return { session, store, change }
}

/** The one route BFS finds from S to G, as the cells to drag the pen through. */
function shortestRoute(session: MazeSession): number[] {
  return runSolver(bfs, session.maze()).path
}

describe('MazeSession', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  describe('building', () => {
    it('starts on solid rock at the size in the settings', () => {
      const { session } = setup({ cols: 12, rows: 7 })
      expect(session.runState()).toBe('idle')
      expect(session.maze().grid.cols).toBe(12)
      expect(session.maze().grid.rows).toBe(7)
      expect(session.deadEnds()).toBeNull()
    })

    it('builds the whole maze in one go at 一気に', () => {
      const { session } = setup()
      const revision = session.revision()
      session.start()
      expect(session.runState()).toBe('done')
      expect(session.steps()).toBeGreaterThan(0)
      expect(session.deadEnds()).toBeGreaterThan(0)
      expect(session.solvable()).toBe(true)
      expect(session.revision()).toBeGreaterThan(revision)
    })

    it('takes as many steps a frame as the speed allows, and stops on pause', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
      const { session } = setup({ speedId: 'slow' })
      session.start()
      expect(session.runState()).toBe('running')
      vi.advanceTimersToNextFrame()
      vi.advanceTimersToNextFrame()
      expect(session.steps()).toBe(4)

      session.togglePlay()
      vi.advanceTimersToNextFrame()
      expect(session.runState()).toBe('paused')
      expect(session.steps()).toBe(4)
    })

    it('finishes off a running build when 一気に is picked', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
      const { session, change } = setup({ speedId: 'slow' })
      session.start()
      change({ speedId: 'instant' })
      expect(session.runState()).toBe('done')
    })

    it('builds a new maze straight away when a finished one is reshaped', () => {
      const { session, change } = setup()
      session.start()
      const before = session.maze()
      change({ cols: 9 })
      expect(session.maze()).not.toBe(before)
      expect(session.maze().grid.cols).toBe(9)
      expect(session.runState()).toBe('done')
    })

    it('only throws a paused maze away, without starting the next', () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
      const { session, change } = setup({ speedId: 'slow' })
      session.start()
      session.togglePlay()
      change({ algorithmId: 'kruskal' })
      expect(session.runState()).toBe('idle')
      expect(session.steps()).toBe(0)
    })

    it('leaves the maze alone when only the search changes', () => {
      const { session, change } = setup()
      session.start()
      const maze = session.maze()
      change({ solverId: 'astar', solveSpeedId: 'slow' })
      expect(session.maze()).toBe(maze)
      expect(session.runState()).toBe('done')
    })
  })

  describe('searching', () => {
    it('cannot search before the maze is finished', () => {
      const { session } = setup()
      session.toggleSolve()
      expect(session.solveState()).toBe('idle')
      expect(session.solve()).toBeNull()
    })

    it('searches the finished maze and reports what it cost', () => {
      const { session } = setup({ solverId: 'bfs' })
      session.start()
      session.toggleSolve()
      expect(session.solveState()).toBe('done')
      const { expanded, routeLength, found } = session.progress()
      expect(found).toBe(true)
      expect(routeLength).toBe(shortestRoute(session).length)
      expect(expanded).toBeGreaterThanOrEqual(routeLength)
    })

    it('searches again when another solver is picked after a search', () => {
      const { session, change } = setup({ solverId: 'dfs' })
      session.start()
      session.toggleSolve()
      const first = session.solve()
      change({ solverId: 'bfs' })
      expect(session.solve()).not.toBe(first)
      expect(session.solveState()).toBe('done')
    })

    it('only clears the search when solving by hand is picked', () => {
      const { session, change } = setup()
      session.start()
      session.toggleSolve()
      change({ solverId: 'by-hand' })
      expect(session.solveState()).toBe('idle')
      expect(session.solve()).toBeNull()
      expect(session.traceable()).toBe(true)
    })

    it('throws the search away with the maze', () => {
      const { session } = setup()
      session.start()
      session.toggleSolve()
      session.reset()
      expect(session.solveState()).toBe('idle')
      expect(session.solve()).toBeNull()
      expect(session.runState()).toBe('idle')
    })
  })

  describe('solving by hand', () => {
    it('puts the pen on the start', () => {
      const { session } = setup({ solverId: 'by-hand' })
      session.start()
      session.toggleSolve()
      expect(session.solveState()).toBe('running')
      expect(session.solve()?.path).toEqual([session.maze().entrance])
    })

    it('only moves the pen through open passages', () => {
      const { session } = setup({ solverId: 'by-hand' })
      session.start()
      session.toggleSolve()
      const start = session.maze().entrance
      const links = session.maze().grid.links[start]
      const open = DIRS.find((dir) => links & dir.bit)
      const shut = DIRS.find((dir) => !(links & dir.bit))
      if (!open || !shut) throw new Error('a corner start has one way in and at least one wall')

      session.stepPen(shut)
      expect(session.solveSteps()).toBe(0)
      session.stepPen(open)
      expect(session.solveSteps()).toBe(1)
      expect(session.progress().routeLength).toBe(2)
    })

    it('reaches the goal along the route and then stops taking the pen', () => {
      const { session } = setup({ solverId: 'by-hand' })
      session.start()
      const [start, ...rest] = shortestRoute(session)
      expect(session.pressCell(start)).toBe(true)
      for (const cell of rest) session.dragCell(cell)

      expect(session.solveState()).toBe('done')
      expect(session.progress().found).toBe(true)
      expect(session.solveSteps()).toBe(rest.length)
      expect(session.traceable()).toBe(false)
      expect(session.pressCell(start)).toBe(false)
    })

    it('does not take the pen while a search is picked', () => {
      const { session } = setup({ solverId: 'dfs' })
      session.start()
      expect(session.traceable()).toBe(false)
      expect(session.pressCell(session.maze().entrance)).toBe(false)
    })
  })
})
