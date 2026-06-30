---
name: ui-visual-test
description: >-
  Render every frontend view in a headless browser and report on UI/UX health.
  Boots the Vite dev server, intercepts all API calls with fixtures (no backend
  or database needed), walks each route in desktop + mobile viewports, captures
  full-page screenshots, and flags console errors, uncaught exceptions, missing
  elements, and unexpected error states. Use to check that all feature displays
  render, after UI changes, or to produce a visual snapshot of the app.
---

# UI visual-test skill

A fixture-driven Playwright harness for the PREREQ frontend. It does **not** need
the real backend or Postgres — every `http://localhost:3000` API call is
intercepted and answered from `frontend/visual-tests/fixtures.ts`. Chromium is
pre-installed in the web environment (`/opt/pw-browsers`, Playwright 1.56.1);
locally, run `npx playwright install chromium` once.

> Note: there is **no "canvas mode"** in the app — `react-flow-*` packages are
> installed but unused. This harness covers the actual, table-driven feature set.

## Run it

```bash
cd frontend
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
  npx playwright test --config=visual-tests/playwright.config.ts
```

Outputs (gitignored):
- `frontend/visual-tests/screenshots/<desktop|mobile>/<view>.png`
- `frontend/visual-tests/report/report.md` (human summary) and `report.json`

## What it covers (the view matrix)
Login, Dashboard (+empty), Projects (+empty +API-error), ProjectDetail/TaskTable
(+no-tasks +API-error), Schedule, Portfolio (+empty), New Project, New Task,
Import Schedule, and a best-effort ResourceDrawer tab walk — each in **desktop
(1440×900)** and **mobile (Pixel 5)**.

Per view it records: a full-page screenshot, console errors, uncaught page
errors, any endpoints that hit no fixture, and whether the expected content (or,
for the `-empty`/`-error` variants, the expected empty/error state) rendered.

## How it works
- `playwright.config.ts` — `webServer` runs `npm run dev` on port 5173; two
  viewport projects; serial (`workers: 1`) so the markdown report accumulates.
- `mock.ts` — `installMocks(page, opts)`: seeds `localStorage.authToken` so the
  app skips Cognito login (AuthContext hydrates via the mocked `GET /auth/profile`),
  answers CORS preflight, and fulfills each endpoint from fixtures. `opts` can set
  a resource to `'empty'` or `'error'`, or `auth:false` to render the Login page.
- `fixtures.ts` — response bodies shaped from the app's own TS types
  (`BackendTask` in `hooks/useTasks.ts`, `resourcesApi.ts`, `dependenciesApi.ts`).
- `visual.spec.ts` — the matrix, assertions, screenshot capture, and report writer.

## Add a new view
1. Add one entry to the `VIEWS` array in `visual.spec.ts` (`id`, `title`, `path`,
   optional `expectText`, `opts`, `allowError`, `action`).
2. If it calls a new endpoint, add a fixture in `fixtures.ts` and a case in
   `resolveBody()` in `mock.ts`. Endpoints with no fixture are flagged "unmocked"
   in the report (they return `[]` so the UI won't hang).

## Reading the report
`report.md` is a per-viewport table: ✅/❌, console-error count, notes (missing
text, error state, unmocked endpoints), and the screenshot path. A ❌ means the
view did not render its expected content, threw an uncaught error, or showed an
unexpected error boundary — open the screenshot and triage (see the
`ui-visual-test` sub-agent).

## Not in CI by default
CI runners would need `npx playwright install`. The frontend CI job sets
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so adding `@playwright/test` as a devDep does
not slow `npm ci`. Wiring a visual job (with a browser-install step) is an optional
follow-up.
