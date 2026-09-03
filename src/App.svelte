<script lang="ts">
  import { onMount } from 'svelte'
  import MazeCanvas from './lib/MazeCanvas.svelte'
  import { algorithms, getAlgorithm } from './lib/maze/algorithms'
  import { createContext } from './lib/maze/grid'
  import { PALETTE } from './lib/maze/renderer'
  import { createRng, randomSeed } from './lib/maze/rng'

  type RunState = 'idle' | 'running' | 'paused' | 'done'

  const STATUS_LABEL: Record<RunState, string> = {
    idle: '待機中',
    running: '生成中',
    paused: '一時停止',
    done: '完成',
  }

  const LEGEND = [
    { color: PALETTE.rock, label: '未踏' },
    { color: PALETTE.frontier, label: '候補' },
    { color: PALETTE.trail, label: '掘削中の経路' },
    { color: PALETTE.corridor, label: '確定した通路' },
    { color: PALETTE.active, label: '注目セル' },
    { color: PALETTE.start, label: 'スタート (S)' },
    { color: PALETTE.goal, label: 'ゴール (G)' },
  ]

  const INITIAL_COLS = 28
  const INITIAL_ROWS = 20

  let cols = $state(INITIAL_COLS)
  let rows = $state(INITIAL_ROWS)
  let algorithmId = $state(algorithms[0].id)
  let stepsPerFrame = $state(6)

  let runState = $state<RunState>('idle')
  let steps = $state(0)
  // Mutated in place, so $state.raw: only rebuilding it needs to trigger a redraw.
  let maze = $state.raw(createContext(INITIAL_COLS, INITIAL_ROWS))

  let view: ReturnType<typeof MazeCanvas> | undefined = $state()
  let generator: Generator<void, void, void> | null = null
  let frame = 0

  const algorithm = $derived(getAlgorithm(algorithmId))
  const primaryLabel = $derived(
    runState === 'running'
      ? '一時停止'
      : runState === 'paused'
        ? '再開'
        : runState === 'done'
          ? 'もう一度生成'
          : '生成する',
  )

  function reset(): void {
    cancelAnimationFrame(frame)
    generator = null
    runState = 'idle'
    steps = 0
    maze = createContext(cols, rows)
  }

  function ensureGenerator(): void {
    if (runState === 'done') reset()
    if (!generator) generator = algorithm.run(maze, createRng(randomSeed()))
  }

  /** Advance one step. Returns true once generation has finished. */
  function advance(): boolean {
    if (!generator) return true
    if (generator.next().done) {
      generator = null
      runState = 'done'
      return true
    }
    steps++
    return false
  }

  function loop(): void {
    for (let i = 0; i < stepsPerFrame; i++) {
      if (advance()) break
    }
    view?.redraw()
    if (runState === 'running') frame = requestAnimationFrame(loop)
  }

  function start(): void {
    ensureGenerator()
    runState = 'running'
    cancelAnimationFrame(frame)
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
  <aside class="panel">
    <div class="panel-body">
      <header>
        <h1>迷路ジェネレーター</h1>
        <p class="subtitle">生成アルゴリズムの動きをそのまま眺める</p>
      </header>

      <fieldset>
        <legend>アルゴリズム</legend>
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
        <legend>速度</legend>
        <label class="slider">
          <span class="slider-label">1 フレームあたり <b>{stepsPerFrame}</b> ステップ</span>
          <input type="range" min="1" max="120" bind:value={stepsPerFrame} />
        </label>
      </fieldset>

      <dl class="status">
        <dt>状態</dt>
        <dd>{STATUS_LABEL[runState]}</dd>
        <dt>ステップ</dt>
        <dd>{steps.toLocaleString()}</dd>
        <dt>セル数</dt>
        <dd>{(cols * rows).toLocaleString()}</dd>
      </dl>

      <ul class="legend">
        {#each LEGEND as item (item.label)}
          <li>
            <span class="swatch" style="background: {item.color}"></span>
            {item.label}
          </li>
        {/each}
      </ul>
    </div>

    <div class="actions">
      <button class="primary" onclick={togglePlay}>{primaryLabel}</button>
      <button onclick={complete} disabled={runState === 'done'}>一気に生成</button>
      <button onclick={reset} disabled={runState === 'idle'}>リセット</button>
    </div>
  </aside>

  <main class="stage">
    <MazeCanvas bind:this={view} {maze} />
  </main>
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.9rem 1.25rem 1.1rem;
    border-top: 1px solid var(--border);
  }

  button {
    flex: 1 1 auto;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--panel-raised);
    color: var(--text);
    font: inherit;
    font-size: 0.82rem;
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
    flex-basis: 100%;
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

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 0.9rem;
    margin: 0;
    padding: 0.9rem 0 0;
    border-top: 1px solid var(--border);
    list-style: none;
    font-size: 0.72rem;
    color: var(--muted);
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
    padding: 1.5rem;
    min-width: 0;
    min-height: 0;
  }

  @media (max-width: 780px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      height: auto;
      min-height: 100%;
      overflow: visible;
    }

    .panel-body {
      overflow-y: visible;
    }

    .panel {
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .stage {
      min-height: 60vh;
    }
  }
</style>
