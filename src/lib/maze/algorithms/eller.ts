import { DIRS, link, shuffle } from '../grid'
import { DONE, TRAIL, type MazeAlgorithm } from '../types'

const EAST = DIRS[1]
const SOUTH = DIRS[2]

/**
 * Eller's algorithm.
 * Works one row at a time and never looks back, so the only thing it has to
 * remember is which cells of the current row are already joined to each other.
 * Cells in different groups are joined sideways at random, then every group
 * drops at least one passage into the row below -- at least one, or that group
 * would be walled off for good. The final row joins whatever is still separate.
 * Because the memory is a single row, a maze of any length can be generated
 * without ever holding all of it at once.
 */
export const eller: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const { cols, rows } = grid

  // Group id per column of the current row. 0 means "not in a group yet".
  let group = new Int32Array(cols)
  let nextId = 1

  for (let y = 0; y < rows; y++) {
    const lastRow = y === rows - 1

    for (let x = 0; x < cols; x++) {
      if (group[x] === 0) group[x] = nextId++
      state[y * cols + x] = TRAIL
    }
    ctx.active = []
    yield

    // Join sideways. On the last row every remaining split has to be closed,
    // otherwise the groups would never meet.
    for (let x = 0; x + 1 < cols; x++) {
      if (group[x] === group[x + 1]) continue
      if (!lastRow && rng() < 0.5) continue

      const absorbed = group[x + 1]
      link(grid, y * cols + x, EAST)
      for (let i = 0; i < cols; i++) {
        if (group[i] === absorbed) group[i] = group[x]
      }
      ctx.active = [y * cols + x]
      yield
    }

    if (!lastRow) {
      const columnsOf = new Map<number, number[]>()
      for (let x = 0; x < cols; x++) {
        const found = columnsOf.get(group[x])
        if (found) found.push(x)
        else columnsOf.set(group[x], [x])
      }

      const carried = new Int32Array(cols)
      ctx.active = []
      for (const [id, columns] of columnsOf) {
        shuffle(columns, rng)
        // The first one is compulsory, the rest are a coin toss each
        for (let i = 0; i < columns.length; i++) {
          if (i > 0 && rng() < 0.5) continue
          const x = columns[i]
          link(grid, y * cols + x, SOUTH)
          carried[x] = id
          ctx.active.push(y * cols + x)
        }
      }
      group = carried
    }

    for (let x = 0; x < cols; x++) state[y * cols + x] = DONE
    yield
  }

  ctx.active = []
}
