import { DONE, FRONTIER, N, TRAIL, W, type MazeContext } from './types'

export const PALETTE = {
  /** Untouched ground, not carved into yet */
  rock: '#191d26',
  /** Candidate cell touching a passage */
  frontier: '#3b4a63',
  /** The path currently being carved */
  trail: '#7dd3fc',
  /** Settled passage */
  corridor: '#e8eef7',
  /** The cell this step is looking at */
  active: '#fb7185',
  start: '#34d399',
  goal: '#fbbf24',
  wall: '#0d1017',
} as const

export interface Viewport {
  width: number
  height: number
}

/**
 * Paint a MazeContext straight onto the canvas. There is no partial redraw --
 * every frame repaints everything.
 * Cells of the same colour are filled together and all walls go into a single
 * path stroked once, which keeps tens of thousands of cells inside one frame.
 */
export function drawMaze(canvas: HTMLCanvasElement, maze: MazeContext, viewport: Viewport): void {
  const { grid } = maze
  const cell = Math.max(
    2,
    Math.floor(Math.min((viewport.width - 4) / grid.cols, (viewport.height - 4) / grid.rows)),
  )
  const lineWidth = cell >= 8 ? 2 : 1
  const inner = { width: cell * grid.cols, height: cell * grid.rows }
  // Half a line width of padding, so the outer walls are not clipped in half
  const pad = lineWidth / 2
  const cssWidth = inner.width + lineWidth
  const cssHeight = inner.height + lineWidth

  const dpr = window.devicePixelRatio || 1
  const pixelWidth = Math.round(cssWidth * dpr)
  const pixelHeight = Math.round(cssHeight * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
  }

  const c = canvas.getContext('2d')
  if (!c) return
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.translate(pad, pad)

  // Flood the whole area with the untouched colour, then paint only the cells that moved on
  c.fillStyle = PALETTE.rock
  c.fillRect(-pad, -pad, cssWidth, cssHeight)
  fillCells(c, maze, cell, FRONTIER, PALETTE.frontier)
  fillCells(c, maze, cell, DONE, PALETTE.corridor)
  fillCells(c, maze, cell, TRAIL, PALETTE.trail)

  drawEndpoints(c, maze, cell)
  strokeWalls(c, maze, cell, lineWidth, inner)
  fillActive(c, maze, cell)
}

function fillCells(
  c: CanvasRenderingContext2D,
  maze: MazeContext,
  cell: number,
  target: number,
  color: string,
): void {
  const { grid, state } = maze
  c.fillStyle = color
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== target) continue
    c.fillRect((i % grid.cols) * cell, Math.floor(i / grid.cols) * cell, cell, cell)
  }
}

function strokeWalls(
  c: CanvasRenderingContext2D,
  maze: MazeContext,
  cell: number,
  lineWidth: number,
  inner: { width: number; height: number },
): void {
  const { grid, entrance, exit } = maze

  c.strokeStyle = PALETTE.wall
  c.lineWidth = lineWidth
  c.lineCap = 'square'
  c.beginPath()

  // Looking only at the north and west side of every cell draws each inner wall
  // exactly once. The top of the start and the bottom of the goal stay open as
  // the way in and the way out.
  for (let i = 0; i < grid.links.length; i++) {
    const x = (i % grid.cols) * cell
    const y = Math.floor(i / grid.cols) * cell
    const links = grid.links[i]
    if (!(links & N) && i !== entrance) {
      c.moveTo(x, y)
      c.lineTo(x + cell, y)
    }
    if (!(links & W)) {
      c.moveTo(x, y)
      c.lineTo(x, y + cell)
    }
  }

  // The rest of the border (east and south edges)
  c.moveTo(inner.width, 0)
  c.lineTo(inner.width, inner.height)
  for (let x = 0; x < grid.cols; x++) {
    if ((grid.rows - 1) * grid.cols + x === exit) continue
    c.moveTo(x * cell, inner.height)
    c.lineTo((x + 1) * cell, inner.height)
  }

  c.stroke()
}

/**
 * Mark the start and the goal.
 * The whole cell is filled, so they stay visible down to a few pixels, and the
 * S / G letters are only drawn when there is room for them.
 */
function drawEndpoints(c: CanvasRenderingContext2D, maze: MazeContext, cell: number): void {
  const { grid } = maze
  const endpoints = [
    { index: maze.entrance, color: PALETTE.start, label: 'S' },
    { index: maze.exit, color: PALETTE.goal, label: 'G' },
  ]
  const withLabel = cell >= 16
  if (withLabel) {
    c.font = `700 ${Math.round(cell * 0.5)}px system-ui, sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
  }

  for (const { index, color, label } of endpoints) {
    const x = (index % grid.cols) * cell
    const y = Math.floor(index / grid.cols) * cell
    c.fillStyle = color
    c.fillRect(x, y, cell, cell)
    if (withLabel) {
      c.fillStyle = PALETTE.wall
      c.fillText(label, x + cell / 2, y + cell / 2)
    }
  }
}

function fillActive(c: CanvasRenderingContext2D, maze: MazeContext, cell: number): void {
  if (maze.active.length === 0) return
  const { grid } = maze
  const inset = Math.min(Math.max(1, cell * 0.18), cell / 2 - 0.5)
  const size = Math.max(1, cell - inset * 2)
  c.fillStyle = PALETTE.active
  for (const i of maze.active) {
    c.fillRect((i % grid.cols) * cell + inset, Math.floor(i / grid.cols) * cell + inset, size, size)
  }
}
