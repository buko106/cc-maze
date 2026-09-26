import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core'
import { braid, countDeadEnds } from '../lib/maze/braid'
import { createContext, createSolveContext, type Direction } from '../lib/maze/grid'
import { createRng, randomSeed } from '../lib/maze/rng'
import * as trace from '../lib/maze/trace'
import type { MazeContext, SolveContext } from '../lib/maze/types'
import { SettingsStore } from './settings-store'

export type RunState = 'idle' | 'running' | 'paused' | 'done'

/** One generator stepped by the loops below. Both building and searching are one of these. */
type Steps = Generator<void, void, void>

/**
 * The maze on screen, the search over it, and the loop that animates the two.
 *
 * The algorithms mutate both contexts in place rather than handing back new
 * ones, so a signal holding a context does not change while it is being built
 * or searched. `revision` is bumped whenever either moves on instead; whatever
 * reads through a context reads that too, to know when to look again.
 */
@Service()
export class MazeSession {
  private readonly store = inject(SettingsStore)
  private readonly settings = this.store.settings

  readonly runState = signal<RunState>('idle')
  readonly steps = signal(0)
  readonly maze = signal(this.createMaze())

  readonly solveState = signal<RunState>('idle')
  readonly solveSteps = signal(0)
  readonly solve = signal<SolveContext | null>(null)

  /** Bumped every time either context changes in place. */
  readonly revision = signal(0)

  readonly solvable = computed(() => this.runState() === 'done')
  /** Once the line reaches the goal it stays as it is until it is cleared. */
  readonly traceable = computed(
    () => this.store.byHand() && this.solvable() && this.solveState() !== 'done',
  )
  /** Only worth counting once the braiding has had its go at them. */
  readonly deadEnds = computed(() =>
    this.runState() === 'done' ? countDeadEnds(this.maze().grid) : null,
  )
  /** What the search has cost so far and where it has got to, read off the live context. */
  readonly progress = computed(() => {
    this.revision()
    const solve = this.solve()
    return {
      expanded: solve?.expanded ?? 0,
      routeLength: solve?.path.length ?? 0,
      found: solve?.found ?? false,
    }
  })

  /** Everything a maze is built from. A change to any of it calls for a new maze. */
  private readonly blueprint = computed(
    () => {
      const { algorithmId, placementId, cols, rows, braidPercent } = this.settings()
      return [algorithmId, placementId, cols, rows, braidPercent]
    },
    { equal: (a, b) => a.every((value, i) => value === b[i]) },
  )

  private generator: Steps | null = null
  private solveGenerator: Steps | null = null
  // Only one of the two loops ever runs, so a single handle is enough
  private frame = 0

  constructor() {
    // A setting that changes the maze throws it away. If it was being built or
    // had already been finished, the new one is built straight away, so a slider
    // can be dragged while the maze keeps up.
    onChange(this.blueprint, () => {
      const wasActive = this.runState() === 'running' || this.runState() === 'done'
      this.reset()
      if (wasActive) this.start()
    })
    // Swapping the solver searches again if the maze had already been searched.
    // Switching to solving by hand only clears it: the line waits for the pen.
    onChange(this.store.solver, () => {
      const wasActive = this.solveState() === 'running' || this.solveState() === 'done'
      this.clearSolve()
      if (wasActive) this.startSolve()
    })
    // Picking 一気に while it is still running finishes off whatever is left
    onChange(this.store.speed, () => {
      if (this.runState() === 'running') this.start()
    })
    onChange(this.store.solveSpeed, () => {
      if (this.solveState() === 'running') this.startSolve()
    })

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame))
  }

  togglePlay(): void {
    if (this.runState() === 'running') this.pause()
    else this.start()
  }

  start(): void {
    cancelAnimationFrame(this.frame)
    if (this.store.speed().stepsPerFrame === Infinity) {
      this.complete()
      return
    }
    this.ensureGenerator()
    this.runState.set('running')
    this.frame = requestAnimationFrame(this.loop)
  }

  reset(): void {
    cancelAnimationFrame(this.frame)
    this.generator = null
    this.runState.set('idle')
    this.steps.set(0)
    this.maze.set(this.createMaze())
    this.clearSolve()
  }

  toggleSolve(): void {
    if (this.store.byHand()) this.startTrace()
    else if (this.solveState() === 'running') this.pauseSolve()
    else this.startSolve()
  }

  clearSolve(): void {
    cancelAnimationFrame(this.frame)
    this.solveGenerator = null
    this.solveState.set('idle')
    this.solveSteps.set(0)
    this.solve.set(null)
  }

  /** The pen went down on the maze. Returns whether to follow the drag that comes after. */
  pressCell(cell: number): boolean {
    if (!this.traceable()) return false
    const ctx = this.solve() ?? createSolveContext(this.maze())
    const moves = trace.press(ctx, cell)
    if (moves === null) return false
    this.solve.set(ctx)
    this.traced(moves)
    return true
  }

  dragCell(cell: number): void {
    const ctx = this.solve()
    if (!this.traceable() || !ctx) return
    const moves = trace.dragTo(ctx, cell)
    if (moves > 0) this.traced(moves)
  }

  stepPen(dir: Direction): void {
    if (!this.traceable()) return
    const ctx = this.solve() ?? createSolveContext(this.maze())
    this.solve.set(ctx)
    this.traced(trace.step(ctx, dir))
  }

  /**
   * Solid rock at the current size, with S and G already placed. A random
   * placement draws a fresh pair here, so every rebuild moves them.
   */
  private createMaze(): MazeContext {
    const { cols, rows } = this.settings()
    const { place } = this.store.placement()
    return createContext(cols, rows, place(cols, rows, createRng(randomSeed())))
  }

  /**
   * Carving and braiding chained into a single generator, so the loop that
   * animates it neither knows nor cares that a maze is built in two phases.
   */
  private *build(ctx: MazeContext, rng: () => number): Steps {
    yield* this.store.algorithm().run(ctx, rng)
    yield* braid(ctx, rng, this.settings().braidPercent / 100)
  }

  private ensureGenerator(): void {
    if (this.runState() === 'done') this.reset()
    this.generator ??= this.build(this.maze(), createRng(randomSeed()))
  }

  private pause(): void {
    cancelAnimationFrame(this.frame)
    this.runState.set('paused')
  }

  /** Drain whatever is left in one go. */
  private complete(): void {
    cancelAnimationFrame(this.frame)
    this.ensureGenerator()
    this.advance(Infinity)
  }

  private readonly loop = (): void => {
    this.advance(this.store.speed().stepsPerFrame)
    if (this.runState() === 'running') this.frame = requestAnimationFrame(this.loop)
  }

  /** Take up to `limit` steps, stopping early once the maze is finished. */
  private advance(limit: number): void {
    let taken = 0
    while (this.generator && taken < limit) {
      if (this.generator.next().done) {
        this.generator = null
        this.runState.set('done')
      } else {
        taken++
      }
    }
    this.steps.update((steps) => steps + taken)
    this.touch()
  }

  private ensureSolver(): void {
    if (this.solveState() === 'done') this.clearSolve()
    const { run } = this.store.solver()
    if (this.solveGenerator || !run) return
    const ctx = createSolveContext(this.maze())
    this.solve.set(ctx)
    this.solveGenerator = run(ctx)
  }

  private startSolve(): void {
    if (!this.solvable() || this.store.byHand()) return
    cancelAnimationFrame(this.frame)
    if (this.store.solveSpeed().stepsPerFrame === Infinity) {
      this.completeSolve()
      return
    }
    this.ensureSolver()
    this.solveState.set('running')
    this.frame = requestAnimationFrame(this.solveLoop)
  }

  private pauseSolve(): void {
    cancelAnimationFrame(this.frame)
    this.solveState.set('paused')
  }

  /** Run the rest of the search in one go. */
  private completeSolve(): void {
    cancelAnimationFrame(this.frame)
    this.ensureSolver()
    this.advanceSolve(Infinity)
  }

  private readonly solveLoop = (): void => {
    this.advanceSolve(this.store.solveSpeed().stepsPerFrame)
    if (this.solveState() === 'running') this.frame = requestAnimationFrame(this.solveLoop)
  }

  /** Take up to `limit` steps, stopping early once the search has finished. */
  private advanceSolve(limit: number): void {
    let taken = 0
    while (this.solveGenerator && taken < limit) {
      if (this.solveGenerator.next().done) {
        this.solveGenerator = null
        this.solveState.set('done')
      } else {
        taken++
      }
    }
    this.solveSteps.update((steps) => steps + taken)
    this.touch()
  }

  /** Throw away the line so far and put the pen on the start. */
  private startTrace(): void {
    if (!this.solvable()) return
    this.clearSolve()
    const ctx = createSolveContext(this.maze())
    trace.begin(ctx)
    this.solve.set(ctx)
    this.solveState.set('running')
  }

  /** Count the moves the pen just made and put them on screen. */
  private traced(moves: number): void {
    const ctx = this.solve()
    if (!ctx) return
    this.solveSteps.update((steps) => steps + moves)
    this.solveState.set(ctx.found ? 'done' : 'running')
    this.touch()
  }

  private touch(): void {
    this.revision.update((revision) => revision + 1)
  }
}

/**
 * Run `action` whenever `source` changes, but not for the value it starts
 * with: that one is the page being set up, not a change anyone made. The
 * action runs untracked, so nothing it reads makes it run again.
 */
function onChange(source: () => unknown, action: () => void): void {
  let initial = true
  effect(() => {
    source()
    if (initial) {
      initial = false
      return
    }
    untracked(action)
  })
}
