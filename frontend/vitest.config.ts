import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated Vitest config so the test runner stays independent of the Vite
// dev/build config. Components render in jsdom; TZ is pinned to UTC so
// date-formatting assertions are deterministic across local machines and CI.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      TZ: 'UTC',
    },
  },
})
