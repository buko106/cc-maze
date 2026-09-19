<script lang="ts">
  import { DIRS, type Direction } from './maze/grid'
  import { drawMaze, measure } from './maze/renderer'
  import type { MazeContext, SolveContext } from './maze/types'

  interface Props {
    maze: MazeContext
    solve: SolveContext | null
    /** Take pointer and arrow-key input for tracing a route by hand */
    traceable?: boolean
    /** The pen went down on a cell. Returning false ignores the drag that would follow. */
    onpress?: (cell: number) => boolean
    /** The pen, still down, moved onto another cell */
    ondrag?: (cell: number) => void
    /** An arrow key was pressed while the maze had the focus */
    onstep?: (dir: Direction) => void
  }

  let { maze, solve, traceable = false, onpress, ondrag, onstep }: Props = $props()

  /** A spot on the grid counted in cells: (2.5, 0.5) is the middle of the third cell in the top row. */
  interface Point {
    x: number
    y: number
  }

  const KEYS: Record<string, Direction | undefined> = {
    ArrowUp: DIRS[0],
    ArrowRight: DIRS[1],
    ArrowDown: DIRS[2],
    ArrowLeft: DIRS[3],
  }

  let wrapper = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let available = $state({ width: 0, height: 0 })
  // The pointer holding the pen, and where it was last seen
  let pen: { id: number; at: Point } | null = null

  /**
   * Called by the generation and search loops on every frame.
   * Both contexts are mutated in place and never reassigned, so drawing has to
   * be triggered explicitly.
   */
  export function redraw(): void {
    if (!canvas || available.width <= 0 || available.height <= 0) return
    drawMaze(canvas, maze, available, solve)
  }

  /** Hand the keyboard to the maze, so the arrow keys move the pen straight away. */
  export function focus(): void {
    canvas?.focus({ preventScroll: true })
  }

  $effect(() => {
    if (!wrapper) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      available = { width, height }
    })
    observer.observe(wrapper)
    return () => observer.disconnect()
  })

  // Follows a rebuilt maze, a new search and a resize on its own, since redraw reads them all
  $effect(redraw)

  /** Measured with the same layout the maze was drawn with, so the two always line up. */
  function toGrid(event: PointerEvent, target: HTMLCanvasElement): Point {
    const box = target.getBoundingClientRect()
    const { cell, pad } = measure(maze.grid, available)
    return {
      x: (event.clientX - box.left - pad) / cell,
      y: (event.clientY - box.top - pad) / cell,
    }
  }

  /** The cell under a point, or -1 off the grid. */
  function cellAt({ x, y }: Point): number {
    const { cols, rows } = maze.grid
    const col = Math.floor(x)
    const row = Math.floor(y)
    if (col < 0 || row < 0 || col >= cols || row >= rows) return -1
    return row * cols + col
  }

  function penDown(event: PointerEvent & { currentTarget: HTMLCanvasElement }): void {
    // One pen at a time, and only the main button of a mouse
    if (!traceable || pen || event.button !== 0) return
    const at = toGrid(event, event.currentTarget)
    const cell = cellAt(at)
    if (cell < 0 || !onpress?.(cell)) return

    // Holding on to the pointer keeps the moves coming even when it strays off
    // the canvas. The default is left alone: the stylesheet already keeps a
    // finger from scrolling, and the click still gives the maze the focus for
    // the arrow keys -- without the focus ring a keyboard would bring.
    event.currentTarget.setPointerCapture(event.pointerId)
    pen = { id: event.pointerId, at }
  }

  function penMove(event: PointerEvent & { currentTarget: HTMLCanvasElement }): void {
    if (!pen || event.pointerId !== pen.id) return
    const from = pen.at
    const to = toGrid(event, event.currentTarget)
    pen.at = to

    // Walk from the previous event in quarter-cell steps, so a quick flick still
    // passes through every cell on the way, in order
    const dx = to.x - from.x
    const dy = to.y - from.y
    const count = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4)
    let last = cellAt(from)
    for (let i = 1; i <= count; i++) {
      const cell = cellAt({ x: from.x + (dx * i) / count, y: from.y + (dy * i) / count })
      if (cell < 0 || cell === last) continue
      last = cell
      ondrag?.(cell)
    }
  }

  function penUp(event: PointerEvent): void {
    if (pen && event.pointerId === pen.id) pen = null
  }

  function keyDown(event: KeyboardEvent): void {
    const dir = KEYS[event.key]
    if (!traceable || !dir) return
    // Otherwise the arrows scroll the page as well
    event.preventDefault()
    onstep?.(dir)
  }
</script>

<div class="viewport" bind:this={wrapper}>
  <canvas
    bind:this={canvas}
    class:traceable
    role={traceable ? 'application' : 'img'}
    tabindex={traceable ? 0 : undefined}
    aria-label={traceable
      ? '迷路。S からなぞって G を目指す。矢印キーでも進める'
      : '生成された迷路'}
    onpointerdown={penDown}
    onpointermove={penMove}
    onpointerup={penUp}
    onpointercancel={penUp}
    onlostpointercapture={penUp}
    onkeydown={keyDown}
  ></canvas>
</div>

<style>
  .viewport {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  canvas {
    display: block;
    border-radius: 4px;
    box-shadow: 0 18px 50px rgb(0 0 0 / 0.45);
  }

  canvas.traceable {
    cursor: crosshair;
    /* A finger on the maze is drawing, so it must not scroll or zoom the page too */
    touch-action: none;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  canvas:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
</style>
