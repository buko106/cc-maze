import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { DIRS, type Direction } from '../../lib/maze/grid'
import { drawMaze, measure, type Viewport } from '../../lib/maze/renderer'
import { MazeSession } from '../maze-session'

/** A spot on the grid counted in cells: (2.5, 0.5) is the middle of the third cell in the top row. */
interface Point {
  x: number
  y: number
}

const KEYS: Partial<Record<string, Direction>> = {
  ArrowUp: DIRS[0],
  ArrowRight: DIRS[1],
  ArrowDown: DIRS[2],
  ArrowLeft: DIRS[3],
}

/**
 * The maze, drawn to fit whatever room the layout gives this element, and the
 * place the pen goes down on when the route is traced by hand.
 */
@Component({
  selector: 'app-maze-canvas',
  templateUrl: './maze-canvas.html',
  styleUrl: './maze-canvas.css',
})
export class MazeCanvas {
  private readonly session = inject(MazeSession)
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly injector = inject(Injector)
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas')

  /** Takes pointer and arrow-key input for tracing a route by hand. */
  protected readonly traceable = this.session.traceable

  /** The room the layout leaves for the maze, kept up to date as it is resized. */
  private readonly available = signal<Viewport>({ width: 0, height: 0 })
  // The pointer holding the pen, and where it was last seen
  private pen: { id: number; at: Point } | null = null

  constructor() {
    const destroyRef = inject(DestroyRef)
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        this.available.set({ width, height })
      })
      observer.observe(this.host.nativeElement)
      destroyRef.onDestroy(() => observer.disconnect())
    })

    // Draws again on a rebuilt maze, a new search, every step either of them
    // takes and every resize, since it reads them all
    afterRenderEffect({
      write: () => {
        const viewport = this.available()
        const maze = this.session.maze()
        const solve = this.session.solve()
        this.session.revision()
        if (viewport.width <= 0 || viewport.height <= 0) return
        drawMaze(this.canvas().nativeElement, maze, viewport, solve)
      },
    })
  }

  /**
   * Hand the keyboard to the maze, so the arrow keys move the pen straight
   * away. Waits for the next render, which is what makes the maze focusable.
   */
  focus(): void {
    afterNextRender(() => this.canvas().nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    })
  }

  protected penDown(event: PointerEvent): void {
    // One pen at a time, and only the main button of a mouse
    if (!this.traceable() || this.pen || event.button !== 0) return
    const at = this.toGrid(event)
    const cell = this.cellAt(at)
    if (cell < 0 || !this.session.pressCell(cell)) return

    // Holding on to the pointer keeps the moves coming even when it strays off
    // the canvas. The default is left alone: the stylesheet already keeps a
    // finger from scrolling, and the click still gives the maze the focus for
    // the arrow keys -- without the focus ring a keyboard would bring.
    this.canvas().nativeElement.setPointerCapture(event.pointerId)
    this.pen = { id: event.pointerId, at }
  }

  protected penMove(event: PointerEvent): void {
    if (!this.pen || event.pointerId !== this.pen.id) return
    const from = this.pen.at
    const to = this.toGrid(event)
    this.pen.at = to

    // Walk from the previous event in quarter-cell steps, so a quick flick still
    // passes through every cell on the way, in order
    const dx = to.x - from.x
    const dy = to.y - from.y
    const count = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4)
    let last = this.cellAt(from)
    for (let i = 1; i <= count; i++) {
      const cell = this.cellAt({ x: from.x + (dx * i) / count, y: from.y + (dy * i) / count })
      if (cell < 0 || cell === last) continue
      last = cell
      this.session.dragCell(cell)
    }
  }

  protected penUp(event: PointerEvent): void {
    if (this.pen && event.pointerId === this.pen.id) this.pen = null
  }

  protected keyDown(event: KeyboardEvent): void {
    const dir = KEYS[event.key]
    if (!this.traceable() || !dir) return
    // Otherwise the arrows scroll the page as well
    event.preventDefault()
    this.session.stepPen(dir)
  }

  /** Measured with the same layout the maze was drawn with, so the two always line up. */
  private toGrid(event: PointerEvent): Point {
    const box = this.canvas().nativeElement.getBoundingClientRect()
    const { cell, pad } = measure(this.session.maze().grid, this.available())
    return {
      x: (event.clientX - box.left - pad) / cell,
      y: (event.clientY - box.top - pad) / cell,
    }
  }

  /** The cell under a point, or -1 off the grid. */
  private cellAt({ x, y }: Point): number {
    const { cols, rows } = this.session.maze().grid
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (col < 0 || row < 0 || col >= cols || row >= rows) return -1
    return row * cols + col
  }
}
