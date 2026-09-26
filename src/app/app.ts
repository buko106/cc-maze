import { Component, afterNextRender, computed, inject, viewChild } from '@angular/core'
import { MazeCanvas } from './maze-canvas/maze-canvas'
import { MazeLegend } from './maze-legend/maze-legend'
import { MazeSession, type RunState } from './maze-session'
import { SettingsPanel } from './settings-panel/settings-panel'
import { SettingsStore } from './settings-store'
import { StatusBoard } from './status-board/status-board'

const PLAY_LABEL: Record<RunState, string> = {
  idle: '生成する',
  running: '一時停止',
  paused: '再開',
  done: '生成し直す',
}

const SOLVE_LABEL: Record<RunState, string> = {
  idle: '解く',
  running: '一時停止',
  paused: '再開',
  done: '解き直す',
}

/** Leaves typing alone; radios and sliders take no letters, so G and S still work on them. */
const TYPING = 'input:not([type=radio]):not([type=range]), textarea, select, [contenteditable]'

@Component({
  selector: 'app-root',
  imports: [MazeCanvas, MazeLegend, SettingsPanel, StatusBoard],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(window:keydown)': 'shortcut($event)',
  },
})
export class App {
  protected readonly session = inject(MazeSession)
  private readonly store = inject(SettingsStore)
  private readonly canvas = viewChild.required(MazeCanvas)

  protected readonly playLabel = computed(() => PLAY_LABEL[this.session.runState()])
  // By hand there is nothing to pause: the button only ever starts the line over
  protected readonly solveLabel = computed(() => {
    const state = this.session.solveState()
    if (this.store.byHand()) return state === 'idle' ? '解く' : '解き直す'
    return SOLVE_LABEL[state]
  })

  /** Keyboard shortcuts for the two primary buttons, matched case-insensitively. */
  private readonly shortcuts: Partial<Record<string, () => void>> = {
    g: () => this.session.togglePlay(),
    s: () => {
      if (this.session.solvable()) this.toggleSolve()
    },
  }

  constructor() {
    // The page opens on a maze being built
    afterNextRender(() => this.session.start())
  }

  protected toggleSolve(): void {
    this.session.toggleSolve()
    if (this.session.traceable()) this.canvas().focus()
  }

  protected shortcut(event: KeyboardEvent): void {
    // Leave browser and OS shortcuts such as Ctrl+S alone, and ignore a held key
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    if (event.target instanceof Element && event.target.closest(TYPING)) return
    const action = this.shortcuts[event.key.toLowerCase()]
    if (!action) return
    event.preventDefault()
    action()
  }
}
