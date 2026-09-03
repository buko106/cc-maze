<script lang="ts">
  import { drawMaze } from './maze/renderer'
  import type { MazeContext } from './maze/types'

  let { maze }: { maze: MazeContext } = $props()

  let wrapper = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let available = $state({ width: 0, height: 0 })

  /**
   * Called by the generation loop on every frame.
   * MazeContext is mutated in place and never reassigned, so drawing has to be
   * triggered explicitly.
   */
  export function redraw(): void {
    if (!canvas || available.width <= 0 || available.height <= 0) return
    drawMaze(canvas, maze, available)
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

  // Follows both a rebuilt maze and a resize on its own, since redraw reads both
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
