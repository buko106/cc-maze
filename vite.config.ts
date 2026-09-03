import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://buko106.github.io/cc-maze/, so assets need the repo name
  base: '/cc-maze/',
  plugins: [svelte()],
})
