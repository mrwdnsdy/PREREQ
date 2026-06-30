import { defineConfig, devices } from '@playwright/test'
import * as path from 'path'

// Visual-test harness config. Boots the Vite dev server and drives Chromium
// (pre-installed in this environment at /opt/pw-browsers — no `playwright install`).
// Run from the `frontend/` directory (the skill does `cd frontend`), so paths are
// resolved against process.cwd() — avoids __dirname (this is an ESM project).
const ROOT = process.cwd()
const HERE = path.join(ROOT, 'visual-tests')

export default defineConfig({
  testDir: HERE,
  testMatch: 'visual.spec.ts',
  globalSetup: path.join(HERE, 'global-setup.ts'),
  globalTeardown: path.join(HERE, 'global-teardown.ts'),
  outputDir: path.join(HERE, 'test-results'),
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: path.join(HERE, 'report', 'playwright.json') }]],
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 7_000,
    screenshot: 'off', // we capture explicitly in the spec
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    cwd: ROOT,
    url: 'http://localhost:5173',
    timeout: 120_000,
    reuseExistingServer: true,
    env: { NODE_ENV: 'development' },
  },
})
