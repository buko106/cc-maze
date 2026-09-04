import { E, FRONTIER, N, S, W, DONE, type MazeAlgorithm } from '../types'

interface Chamber {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * Recursive division.
 * The odd one out: every other algorithm here carves passages into solid rock,
 * this one starts with nothing but open floor and puts walls in. A chamber is
 * cut in two by a straight wall with a single gap, and each half is cut again
 * until nothing is left that is wider than one cell.
 * That top-down split is what gives it long straight walls and rooms, instead
 * of the winding corridors the carvers produce.
 */
export const division: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const { cols, rows, links } = grid

  // One wide open chamber to begin with: every cell joined to all its neighbours
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      state[i] = FRONTIER
      links[i] = (y > 0 ? N : 0) | (x + 1 < cols ? E : 0) | (y + 1 < rows ? S : 0) | (x > 0 ? W : 0)
    }
  }

  const pending: Chamber[] = [{ x: 0, y: 0, w: cols, h: rows }]

  while (pending.length > 0) {
    const room = pending.pop() as Chamber

    if (room.w <= 1 || room.h <= 1) {
      // Nothing left to cut: this strip is part of the finished maze
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) state[y * cols + x] = DONE
      }
      ctx.active = []
      yield
      continue
    }

    // Cut across the long side, so chambers stay roughly square
    const horizontal = room.h > room.w ? true : room.w > room.h ? false : rng() < 0.5
    ctx.active = []

    if (horizontal) {
      const wallY = room.y + Math.floor(rng() * (room.h - 1))
      const gap = room.x + Math.floor(rng() * room.w)
      for (let x = room.x; x < room.x + room.w; x++) {
        if (x === gap) continue
        const above = wallY * cols + x
        links[above] &= ~S
        links[above + cols] &= ~N
        ctx.active.push(above)
      }
      pending.push({ x: room.x, y: room.y, w: room.w, h: wallY - room.y + 1 })
      pending.push({ x: room.x, y: wallY + 1, w: room.w, h: room.y + room.h - wallY - 1 })
    } else {
      const wallX = room.x + Math.floor(rng() * (room.w - 1))
      const gap = room.y + Math.floor(rng() * room.h)
      for (let y = room.y; y < room.y + room.h; y++) {
        if (y === gap) continue
        const left = y * cols + wallX
        links[left] &= ~E
        links[left + 1] &= ~W
        ctx.active.push(left)
      }
      pending.push({ x: room.x, y: room.y, w: wallX - room.x + 1, h: room.h })
      pending.push({ x: wallX + 1, y: room.y, w: room.x + room.w - wallX - 1, h: room.h })
    }

    yield
  }

  ctx.active = []
}
