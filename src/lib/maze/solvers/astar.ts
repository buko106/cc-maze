import { openNeighbors, tracePath } from '../grid'
import { FRINGE, SEARCHED, UNSEEN, type Grid, type SolveAlgorithm } from '../types'

const UNREACHED = 0x7fffffff

/** Steps needed to walk from a to b with the walls taken away. */
function manhattan(grid: Grid, a: number, b: number): number {
  const dx = Math.abs((a % grid.cols) - (b % grid.cols))
  const dy = Math.abs(Math.floor(a / grid.cols) - Math.floor(b / grid.cols))
  return dx + dy
}

/**
 * Binary min-heap over cell indices, ordered by the score array handed in.
 * Small enough to keep here rather than growing a generic priority queue.
 */
function heapPush(heap: number[], score: Int32Array, cell: number): void {
  heap.push(cell)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (score[heap[parent]] <= score[heap[i]]) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}

function heapPop(heap: number[], score: Int32Array): number {
  const top = heap[0]
  const last = heap.pop() as number
  if (heap.length === 0) return top

  heap[0] = last
  for (let i = 0; ;) {
    const left = i * 2 + 1
    const right = left + 1
    let best = i
    if (left < heap.length && score[heap[left]] < score[heap[best]]) best = left
    if (right < heap.length && score[heap[right]] < score[heap[best]]) best = right
    if (best === i) return top
    ;[heap[best], heap[i]] = [heap[i], heap[best]]
    i = best
  }
}

/**
 * A* with the Manhattan distance as the heuristic.
 * Always expands the cell with the smallest "steps so far + straight-line guess
 * at what is left", so the search leans towards the goal instead of spreading
 * evenly like breadth-first search does.
 * The heuristic never overestimates -- no wall can make the walk shorter than
 * the straight line -- so the route it finds is still a shortest one.
 */
export const astar: SolveAlgorithm = function* (ctx) {
  const { grid, state, start, goal } = ctx
  const size = grid.links.length
  const cost = new Int32Array(size).fill(UNREACHED)
  const estimate = new Int32Array(size).fill(UNREACHED)
  const parent = new Int32Array(size).fill(-1)
  const heap: number[] = []
  const open: number[] = []

  cost[start] = 0
  estimate[start] = manhattan(grid, start, goal)
  state[start] = FRINGE
  heapPush(heap, estimate, start)

  while (heap.length > 0) {
    const current = heapPop(heap, estimate)
    // A cell can sit in the heap more than once; skip the stale copies
    if (state[current] === SEARCHED) continue

    state[current] = SEARCHED
    ctx.expanded++
    ctx.active = [current]

    if (current === goal) {
      ctx.path = tracePath(parent, goal)
      ctx.found = true
      ctx.active = []
      return
    }

    for (const next of openNeighbors(grid, current, open)) {
      const stepped = cost[current] + 1
      if (stepped >= cost[next]) continue
      cost[next] = stepped
      estimate[next] = stepped + manhattan(grid, next, goal)
      parent[next] = current
      if (state[next] === UNSEEN) state[next] = FRINGE
      heapPush(heap, estimate, next)
    }
    yield
  }

  ctx.active = []
}
