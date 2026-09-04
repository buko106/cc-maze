<script lang="ts">
  import { onMount } from 'svelte'
  import MazeCanvas from './lib/MazeCanvas.svelte'
  import { algorithms, getAlgorithm } from './lib/maze/algorithms'
  import { braid, countDeadEnds } from './lib/maze/braid'
  import { createContext, createSolveContext } from './lib/maze/grid'
  import { PALETTE } from './lib/maze/renderer'
  import { createRng, randomSeed } from './lib/maze/rng'
  import { getSolver, solvers } from './lib/maze/solvers'
  import type { MazeContext, SolveContext } from './lib/maze/types'

  type RunState = 'idle' | 'running' | 'paused' | 'done'

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

  interface Speed {
    readonly id: string
    readonly name: string
    /** Steps to take per frame. Infinity means "do not animate, just finish". */
    readonly stepsPerFrame: number
  }

  const SPEEDS: readonly Speed[] = [
    { id: 'slow', name: 'ゆっくり', stepsPerFrame: 2 },
    { id: 'fast', name: '早く', stepsPerFrame: 20 },
    { id: 'instant', name: '一気に', stepsPerFrame: Infinity },
  ]

  function getSpeed(id: string): Speed {
    return SPEEDS.find((entry) => entry.id === id) ?? SPEEDS[0]
  }

  const LEGEND_GENERATE = [
    { color: PALETTE.rock, label: '未踏' },
    { color: PALETTE.frontier, label: '候補' },
    { color: PALETTE.trail, label: '掘削中の経路' },
    { color: PALETTE.corridor, label: '確定した通路' },
    { color: PALETTE.start, label: 'スタート (S)' },
    { color: PALETTE.goal, label: 'ゴール (G)' },
  ]

  const LEGEND_SOLVE = [
    { color: PALETTE.searched, label: '探索済み' },
    { color: PALETTE.fringe, label: 'フロンティア' },
    // Only the bidirectional search paints these two
    { color: PALETTE.searchedBack, label: '探索済み（ゴール側）' },
    { color: PALETTE.fringeBack, label: 'フロンティア（ゴール側）' },
    { color: PALETTE.route, label: '経路' },
    { color: PALETTE.active, label: '注目セル' },
  ]

  /**
   * A phone held upright starts with a smaller maze: at that width 28x20 leaves
   * cells about 10px across, too small to tell the search colours apart.
   * Roughly square, because the strip the maze is pinned into is about as wide
   * as it is tall -- a portrait maze would leave the sides empty.
   * The breakpoint has to stay in step with the one in the stylesheet below.
   */
  const NARROW = window.matchMedia('(max-width: 780px)').matches
  const INITIAL_COLS = NARROW ? 18 : 28
  const INITIAL_ROWS = NARROW ? 18 : 20

  let cols = $state(INITIAL_COLS)
  let rows = $state(INITIAL_ROWS)
  let algorithmId = $state(algorithms[0].id)
  /** Share of the dead ends to open up once the maze is carved. 0 keeps it perfect. */
  let braidPercent = $state(0)
  let speedId = $state('fast')
  let solverId = $state(solvers[0].id)
  let solveSpeedId = $state('fast')

  let runState = $state<RunState>('idle')
  let steps = $state(0)
  let deadEnds = $state(0)
  // Mutated in place, so $state.raw: only rebuilding it needs to trigger a redraw.
  let maze = $state.raw(createContext(INITIAL_COLS, INITIAL_ROWS))

  let solveState = $state<RunState>('idle')
  let solveSteps = $state(0)
  // Same deal as maze. The counters below mirror it, because reading through a
  // raw state never re-renders on its own.
  let solve = $state.raw<SolveContext | null>(null)
  let expanded = $state(0)
  let routeLength = $state(0)
  let solveFound = $state(false)

  let view: ReturnType<typeof MazeCanvas> | undefined = $state()
  let generator: Generator<void, void, void> | null = null
  let solveGenerator: Generator<void, void, void> | null = null
  // Only one of the two loops ever runs, so a single handle is enough
  let frame = 0

  const algorithm = $derived(getAlgorithm(algorithmId))
  const solver = $derived(getSolver(solverId))
  const solvable = $derived(runState === 'done')
  const braided = $derived(braidPercent > 0)
  /** Set while a method that leans on a perfect maze is picked on a braided one. */
  const braidNote = $derived(braided ? solver.braidNote : undefined)
  const speed = $derived(getSpeed(speedId))
  const solveSpeed = $derived(getSpeed(solveSpeedId))
  const primaryLabel = $derived(
    runState === 'running'
      ? '一時停止'
      : runState === 'paused'
        ? '再開'
        : runState === 'done'
          ? '生成し直す'
          : '生成する',
  )
  const solveStatus = $derived(
    solveState === 'done' && !solveFound ? '到達できず' : SOLVE_STATUS_LABEL[solveState],
  )
  const solveLabel = $derived(
    solveState === 'running'
      ? '一時停止'
      : solveState === 'paused'
        ? '再開'
        : solveState === 'done'
          ? '解き直す'
          : '解く',
  )

  function reset(): void {
    cancelAnimationFrame(frame)
    generator = null
    runState = 'idle'
    steps = 0
    deadEnds = 0
    maze = createContext(cols, rows)
    clearSolve()
  }

  /**
   * Carving and braiding chained into a single generator, so the loop that
   * animates it neither knows nor cares that a maze is built in two phases.
   */
  function* buildMaze(ctx: MazeContext, rng: () => number): Generator<void, void, void> {
    yield* algorithm.run(ctx, rng)
    yield* braid(ctx, rng, braidPercent / 100)
  }

  function ensureGenerator(): void {
    if (runState === 'done') reset()
    if (!generator) generator = buildMaze(maze, createRng(randomSeed()))
  }

  /** Advance one step. Returns true once generation has finished. */
  function advance(): boolean {
    if (!generator) return true
    if (generator.next().done) {
      generator = null
      runState = 'done'
      // Only worth counting once the braiding has had its go at them
      deadEnds = countDeadEnds(maze.grid)
      return true
    }
    steps++
    return false
  }

  function loop(): void {
    for (let i = 0; i < speed.stepsPerFrame; i++) {
      if (advance()) break
    }
    view?.redraw()
    if (runState === 'running') frame = requestAnimationFrame(loop)
  }

  function start(): void {
    cancelAnimationFrame(frame)
    if (speed.stepsPerFrame === Infinity) {
      complete()
      return
    }
    ensureGenerator()
    runState = 'running'
    frame = requestAnimationFrame(loop)
  }

  function pause(): void {
    cancelAnimationFrame(frame)
    runState = 'paused'
  }

  /** Drain whatever is left in one go */
  function complete(): void {
    cancelAnimationFrame(frame)
    ensureGenerator()
    while (!advance()) {
      // until the maze is finished
    }
    view?.redraw()
  }

  function clearSolve(): void {
    cancelAnimationFrame(frame)
    solveGenerator = null
    solveState = 'idle'
    solveSteps = 0
    solve = null
    expanded = 0
    routeLength = 0
    solveFound = false
  }

  function ensureSolver(): void {
    if (solveState === 'done') clearSolve()
    if (!solveGenerator) {
      solve = createSolveContext(maze)
      solveGenerator = solver.run(solve)
    }
  }

  /** Advance one step. Returns true once the search has finished. */
  function advanceSolve(): boolean {
    if (!solveGenerator) return true
    if (solveGenerator.next().done) {
      solveGenerator = null
      solveState = 'done'
      return true
    }
    solveSteps++
    return false
  }

  /** Copy the counters out of the raw context so the panel follows along. */
  function syncSolveStats(): void {
    expanded = solve?.expanded ?? 0
    routeLength = solve?.path.length ?? 0
    solveFound = solve?.found ?? false
  }

  function solveLoop(): void {
    for (let i = 0; i < solveSpeed.stepsPerFrame; i++) {
      if (advanceSolve()) break
    }
    syncSolveStats()
    view?.redraw()
    if (solveState === 'running') frame = requestAnimationFrame(solveLoop)
  }

  function startSolve(): void {
    if (!solvable) return
    cancelAnimationFrame(frame)
    if (solveSpeed.stepsPerFrame === Infinity) {
      completeSolve()
      return
    }
    ensureSolver()
    solveState = 'running'
    frame = requestAnimationFrame(solveLoop)
  }

  function pauseSolve(): void {
    cancelAnimationFrame(frame)
    solveState = 'paused'
  }

  /** Run the rest of the search in one go */
  function completeSolve(): void {
    if (!solvable) return
    cancelAnimationFrame(frame)
    ensureSolver()
    while (!advanceSolve()) {
      // until the goal is reached
    }
    syncSolveStats()
    view?.redraw()
  }

  function toggleSolve(): void {
    if (solveState === 'running') pauseSolve()
    else startSolve()
  }

  /** Swap the solver and, if the maze had already been searched, search again. */
  function reselectSolver(id: string): void {
    const wasActive = solveState === 'running' || solveState === 'done'
    solverId = id
    clearSolve()
    if (wasActive) startSolve()
  }

  /** Picking 一気に while it is still running finishes off whatever is left. */
  function selectSpeed(id: string): void {
    speedId = id
    if (runState === 'running') start()
  }

  function selectSolveSpeed(id: string): void {
    solveSpeedId = id
    if (solveState === 'running') startSolve()
  }

  function togglePlay(): void {
    if (runState === 'running') pause()
    else start()
  }

  /** Change a setting and rebuild. If it was running, keep it running with the new setting. */
  function reconfigure(apply: () => void): void {
    const wasActive = runState === 'running' || runState === 'done'
    apply()
    reset()
    if (wasActive) start()
  }

  onMount(() => {
    start()
    return () => cancelAnimationFrame(frame)
  })
</script>

<div class="app">
  <!-- The maze comes first so that stacking it above the panel on a phone takes
       no visual reordering, and the reading order still matches the screen -->
  <main class="stage">
    <MazeCanvas bind:this={view} {maze} {solve} />
  </main>

  <aside class="panel">
    <div class="panel-body">
      <header>
        <h1>迷路ジェネレーター</h1>
        <p class="subtitle">迷路を作るところと、解くところを続けて眺める</p>
      </header>

      <fieldset>
        <legend>生成アルゴリズム</legend>
        <div class="algorithms">
          {#each algorithms as entry (entry.id)}
            <label class="algorithm" class:selected={entry.id === algorithmId}>
              <input
                type="radio"
                name="algorithm"
                value={entry.id}
                checked={entry.id === algorithmId}
                onchange={() => reconfigure(() => (algorithmId = entry.id))}
              />
              <span class="algorithm-name">{entry.name}</span>
              <span class="algorithm-description">{entry.description}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend>探索アルゴリズム</legend>
        <div class="algorithms">
          {#each solvers as entry (entry.id)}
            <label class="algorithm" class:selected={entry.id === solverId}>
              <input
                type="radio"
                name="solver"
                value={entry.id}
                checked={entry.id === solverId}
                onchange={() => reselectSolver(entry.id)}
              />
              <span class="algorithm-name">{entry.name}</span>
              <span class="algorithm-description">{entry.description}</span>
            </label>
          {/each}
        </div>
        {#if braided}
          <p class="hint">
            ループがあるので 2 点を結ぶ道は何本もある。差が出るのは調べたセル数だけではなく、
            <b>手法ごとに見つける経路そのものが変わる</b>。BFS・A*・双方向 BFS
            は必ず最短の道を返し、DFS と右手法は先に行き当たった道を返す。
          </p>
        {:else}
          <p class="hint">
            完全迷路なので 2 点を結ぶ道は 1
            本しかなく、どの手法でも同じ経路にたどり着く。差が出るのは
            <b>そこへ行き着くまでに何セル調べたか</b>。
          </p>
        {/if}
        {#if braidNote}
          <p class="warning">{braidNote}</p>
        {/if}
      </fieldset>

      <fieldset>
        <legend>サイズ</legend>
        <label class="slider">
          <span class="slider-label">横 <b>{cols}</b></span>
          <input
            type="range"
            min="5"
            max="90"
            value={cols}
            oninput={(event) => reconfigure(() => (cols = event.currentTarget.valueAsNumber))}
          />
        </label>
        <label class="slider">
          <span class="slider-label">縦 <b>{rows}</b></span>
          <input
            type="range"
            min="5"
            max="70"
            value={rows}
            oninput={(event) => reconfigure(() => (rows = event.currentTarget.valueAsNumber))}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>ループ</legend>
        <label class="slider">
          <span class="slider-label">行き止まりをつぶす <b>{braidPercent}%</b></span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={braidPercent}
            oninput={(event) =>
              reconfigure(() => (braidPercent = event.currentTarget.valueAsNumber))}
          />
        </label>
        <p class="hint">
          掘り終えた迷路の行き止まりを開けて輪を作る。0% なら完全迷路のまま、100%
          なら行き止まりがひとつも残らない。輪ができるほど、迷路を抜ける道は何本もできる。
        </p>
      </fieldset>

      <fieldset>
        <legend>速度</legend>
        <div class="speed">
          <span class="speed-label">生成</span>
          <div class="segmented">
            {#each SPEEDS as option (option.id)}
              <label class:selected={option.id === speedId}>
                <input
                  type="radio"
                  name="speed"
                  value={option.id}
                  checked={option.id === speedId}
                  onchange={() => selectSpeed(option.id)}
                />
                {option.name}
              </label>
            {/each}
          </div>
        </div>
        <div class="speed">
          <span class="speed-label">探索</span>
          <div class="segmented">
            {#each SPEEDS as option (option.id)}
              <label class:selected={option.id === solveSpeedId}>
                <input
                  type="radio"
                  name="solve-speed"
                  value={option.id}
                  checked={option.id === solveSpeedId}
                  onchange={() => selectSolveSpeed(option.id)}
                />
                {option.name}
              </label>
            {/each}
          </div>
        </div>
      </fieldset>

      <dl class="status">
        <dt>生成</dt>
        <dd>{STATUS_LABEL[runState]} / {steps.toLocaleString()} ステップ</dd>
        <dt>行き止まり</dt>
        <dd>{runState === 'done' ? deadEnds.toLocaleString() : '—'}</dd>
        <dt>探索</dt>
        <dd>{solveStatus} / {solveSteps.toLocaleString()} ステップ</dd>
        <dt>調べたセル</dt>
        <dd>
          {expanded.toLocaleString()} / {(cols * rows).toLocaleString()}
          {#if expanded > 0}<span class="ratio"
              >({Math.round((expanded / (cols * rows)) * 100)}%)</span
            >{/if}
        </dd>
        <dt>経路の長さ</dt>
        <dd>{routeLength > 0 ? routeLength.toLocaleString() : '—'}</dd>
      </dl>

      <div class="legend">
        <p class="legend-title">生成</p>
        <ul>
          {#each LEGEND_GENERATE as item (item.label)}
            <li>
              <span class="swatch" style="background: {item.color}"></span>
              {item.label}
            </li>
          {/each}
        </ul>
        <p class="legend-title">探索</p>
        <ul>
          {#each LEGEND_SOLVE as item (item.label)}
            <li>
              <span class="swatch" style="background: {item.color}"></span>
              {item.label}
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="actions">
      <div class="action-row">
        <button class="primary" onclick={togglePlay}>{primaryLabel}</button>
        <button onclick={reset} disabled={runState === 'idle'}>リセット</button>
      </div>
      <div class="action-row">
        <button class="primary" onclick={toggleSolve} disabled={!solvable}>{solveLabel}</button>
        <button onclick={clearSolve} disabled={solveState === 'idle'}>クリア</button>
      </div>
    </div>
  </aside>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 320px 1fr;
    /* Without a fixed 1fr row, the panel's content height stretches the whole page */
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    overflow: hidden;
  }

  .panel {
    display: grid;
    /* Only the body scrolls; the action row stays visible as a footer */
    grid-template-rows: minmax(0, 1fr) auto;
    grid-area: 1 / 1;
    min-height: 0;
    background: var(--panel);
    border-right: 1px solid var(--border);
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem 1.25rem;
    overflow-y: auto;
  }

  h1 {
    margin: 0;
    font-size: 1.15rem;
    letter-spacing: 0.02em;
  }

  .subtitle {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: none;
  }

  legend {
    padding: 0 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--muted);
    text-transform: uppercase;
  }

  .algorithms {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .algorithm {
    display: grid;
    /* Contains the hidden radio below; without it the radio is laid out against
       the viewport and drags the page height along with the list */
    position: relative;
    gap: 0.3rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel-raised);
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .algorithm:hover {
    border-color: #3a4356;
  }

  .algorithm.selected {
    border-color: var(--accent);
    background: #1b2733;
  }

  .algorithm input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .algorithm-name {
    font-size: 0.88rem;
    font-weight: 600;
  }

  .algorithm-description {
    font-size: 0.74rem;
    line-height: 1.55;
    color: var(--muted);
  }

  .slider {
    display: block;
    margin-bottom: 0.75rem;
  }

  .slider:last-child {
    margin-bottom: 0;
  }

  .slider-label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.78rem;
    color: var(--muted);
  }

  .slider-label b {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--accent-strong);
  }

  .speed {
    display: grid;
    grid-template-columns: 3rem 1fr;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }

  .speed:last-child {
    margin-bottom: 0;
  }

  .speed-label {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
  }

  .segmented label {
    position: relative;
    padding: 0.42rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--panel-raised);
    font-size: 0.76rem;
    text-align: center;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  .segmented label:hover {
    border-color: #3a4356;
  }

  .segmented label.selected {
    border-color: transparent;
    background: var(--accent-strong);
    color: #06121c;
    font-weight: 700;
  }

  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .hint {
    margin: 0.7rem 0 0;
    font-size: 0.72rem;
    line-height: 1.6;
    color: var(--muted);
  }

  .hint b {
    color: var(--text);
    font-weight: 600;
  }

  /* Same voice as .hint, but for the method that is about to misbehave */
  .warning {
    margin: 0.7rem 0 0;
    padding: 0.55rem 0.7rem;
    border-left: 2px solid var(--caution);
    border-radius: 0 6px 6px 0;
    background: #241f14;
    font-size: 0.72rem;
    line-height: 1.6;
    color: #efd9a6;
  }

  .actions {
    display: grid;
    gap: 0.45rem;
    padding: 0.9rem 1.25rem 1.1rem;
    border-top: 1px solid var(--border);
    /* The controls themselves opt out of double-tap zoom in app.css; the bar
       around them has to as well, or a tap landing in a gap revives the gesture */
    touch-action: manipulation;
  }

  .action-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.4rem;
  }

  button {
    padding: 0.55rem 0.3rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--panel-raised);
    color: var(--text);
    font: inherit;
    /* Small enough that the longest label still fits on one line at 320px */
    font-size: 0.76rem;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s,
      background 0.15s;
  }

  button:hover:not(:disabled) {
    border-color: #3a4356;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button.primary {
    border-color: transparent;
    background: var(--accent-strong);
    color: #06121c;
    font-weight: 700;
  }

  button.primary:hover {
    background: var(--accent);
  }

  .status {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 1rem;
    margin: 0;
    font-size: 0.78rem;
  }

  .status dt {
    color: var(--muted);
  }

  .status dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .status .ratio {
    color: var(--muted);
  }

  .legend {
    padding: 0.9rem 0 0;
    border-top: 1px solid var(--border);
    font-size: 0.72rem;
    color: var(--muted);
  }

  .legend-title {
    margin: 0 0 0.4rem;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--muted);
    text-transform: uppercase;
  }

  .legend ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.9rem;
    margin: 0 0 0.9rem;
    padding: 0;
    list-style: none;
  }

  .legend ul:last-child {
    margin-bottom: 0;
  }

  .legend li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 3px;
  }

  .stage {
    grid-area: 1 / 2;
    padding: 1.5rem;
    min-width: 0;
    min-height: 0;
  }

  /*
   * Phone held upright. The maze is pinned to the top of the screen and the two
   * action rows to the bottom, so the settings in between can be scrolled
   * without ever losing sight of the maze or of the buttons that drive it.
   */
  @media (max-width: 780px) {
    /* Block flow rather than grid: a sticky grid item may only travel within its
       own row, which here is exactly its own height, so it would never move. */
    .app {
      display: block;
      height: auto;
      min-height: 100%;
      overflow: visible;
    }

    .stage {
      position: sticky;
      top: 0;
      z-index: 2;
      /* dvh so the address bar sliding away does not resize the maze */
      height: 42vh;
      height: 42dvh;
      min-height: 200px;
      padding: 0.7rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }

    .panel {
      display: block;
      border-right: none;
    }

    .panel-body {
      /* Clear the fixed action bar, and the home indicator underneath it */
      padding: 1.1rem 0.9rem calc(8.5rem + env(safe-area-inset-bottom));
      overflow-y: visible;
    }

    .actions {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 3;
      /* Wider than on a pointer, so a thumb aiming for 解く does not land on
         生成し直す in the row above */
      gap: 0.7rem;
      padding: 0.6rem 0.9rem calc(0.6rem + env(safe-area-inset-bottom));
      background: var(--panel);
    }

    /* 44px is about the smallest target a fingertip hits reliably */
    button,
    .segmented label {
      min-height: 44px;
      font-size: 0.85rem;
    }

    .segmented label {
      display: grid;
      place-items: center;
    }

    .algorithm {
      padding: 0.8rem 0.85rem;
    }

    .algorithm-name {
      font-size: 0.92rem;
    }

    .algorithm-description {
      font-size: 0.78rem;
    }

    /* The thumb keeps its size, but the band you can grab it by grows */
    input[type='range'] {
      height: 2.75rem;
    }

    h1 {
      font-size: 1.05rem;
    }
  }
</style>
