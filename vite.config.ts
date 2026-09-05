import { svelte } from '@sveltejs/vite-plugin-svelte'
// vitest/config re-exports vite's defineConfig with the test section typed,
// so the app build and the test run keep reading the same file
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://buko106.github.io/cc-maze/, so assets need the repo name
  base: '/cc-maze/',
  plugins: [svelte()],
  test: {
    // Everything under test here is plain TypeScript; no DOM is needed
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
