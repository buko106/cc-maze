import { DecimalPipe } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { MazeSession, type RunState } from '../maze-session'

const STATUS_LABEL: Record<RunState, string> = {
  idle: '待機中',
  running: '生成中',
  paused: '一時停止',
  done: '完成',
}

const SOLVE_STATUS_LABEL: Record<RunState, string> = {
  idle: '未探索',
  running: '探索中',
  paused: '一時停止',
  done: '到達',
}

/** How far the maze and the search have got, and what the search has cost. */
@Component({
  selector: 'app-status-board',
  imports: [DecimalPipe],
  templateUrl: './status-board.html',
  styleUrl: './status-board.css',
})
export class StatusBoard {
  protected readonly session = inject(MazeSession)

  protected readonly status = computed(() => STATUS_LABEL[this.session.runState()])
  protected readonly solveStatus = computed(() => {
    const state = this.session.solveState()
    return state === 'done' && !this.session.progress().found
      ? '到達できず'
      : SOLVE_STATUS_LABEL[state]
  })
  protected readonly cellCount = computed(() => this.session.maze().grid.links.length)
  protected readonly ratio = computed(() =>
    Math.round((this.session.progress().expanded / this.cellCount()) * 100),
  )
}
