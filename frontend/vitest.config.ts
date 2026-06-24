import { defineConfig } from 'vitest/config'

// Dedicated Vitest config so the test runner stays independent of the Vite
// dev/build config. Tests run in a Node environment; TZ is pinned to UTC so
// date-formatting assertions are deterministic across local machines and CI.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      TZ: 'UTC',
    },
  },
})
