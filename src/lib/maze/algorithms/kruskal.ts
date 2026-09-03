import { DIRS, link, neighbor, shuffle, type Direction } from '../grid'
import { DONE, type MazeAlgorithm } from '../types'

/** Looking at the east and south side of every cell enumerates each inner wall exactly once */
const INNER_WALLS = [DIRS[1], DIRS[2]]

/**
 * Kruskal's algorithm.
 * Shuffle every wall, then knock one down whenever its two sides still belong
 * to different regions.
 * Islands appear all over the grid and finally merge into a single one.
 */
export const kruskal: MazeAlgorithm = function* (ctx, rng) {
  const { grid, state } = ctx
  const size = grid.links.length

  if (size === 1) {
    // There is no wall to knock down, so this single cell is already a finished maze
    state[0] = DONE
    return
  }

  const walls: { cell: number; dir: Direction }[] = []
  for (let cell = 0; cell < size; cell++) {
    for (const dir of INNER_WALLS) {
      if (neighbor(grid, cell, dir) >= 0) walls.push({ cell, dir })
    }
  }
  shuffle(walls, rng)

  // Union-Find. Keep knocking walls down until every region has merged into one.
  const parent = new Int32Array(size)
  for (let i = 0; i < size; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }

  for (const wall of walls) {
    const a = wall.cell
    const b = neighbor(grid, a, wall.dir)
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) continue // already joined by another route: keep the wall

    parent[rootA] = rootB
    link(grid, a, wall.dir)
    state[a] = DONE
    state[b] = DONE
    ctx.active = [a, b]
    yield
  }

  ctx.active = []
}
