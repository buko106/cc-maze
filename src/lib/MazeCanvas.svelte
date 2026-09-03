<script lang="ts">
  import { drawMaze } from './maze/renderer'
  import type { MazeContext, SolveContext } from './maze/types'

  let { maze, solve }: { maze: MazeContext; solve: SolveContext | null } = $props()

  let wrapper = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let available = $state({ width: 0, height: 0 })

  /**
   * Called by the generation and search loops on every frame.
   * Both contexts are mutated in place and never reassigned, so drawing has to
   * be triggered explicitly.
   */
  export function redraw(): void {
    if (!canvas || available.width <= 0 || available.height <= 0) return
    drawMaze(canvas, maze, available, solve)
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
</script>

<div class="viewport" bind:this={wrapper}>
  <canvas bind:this={canvas} aria-label="生成された迷路"></canvas>
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
</style>
