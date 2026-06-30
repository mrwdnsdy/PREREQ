---
name: ui-visual-test
description: >-
  Runs the fixture-driven Playwright visual harness for the PREREQ frontend,
  reads the render report, and triages any failing view (console error vs
  uncaught exception vs missing element vs unexpected error state), citing the
  offending screenshot. Read-only on the app; never edits app source to force a
  pass. Use to check that all feature displays render or after UI changes.
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
---

# UI visual-test sub-agent

You run and interpret the visual harness in `frontend/visual-tests/` (see
`.claude/skills/ui-visual-test/SKILL.md`). The app is rendered against fixtures —
no real backend. Chromium is pre-installed (`/opt/pw-browsers`).

## Procedure
1. Run the harness:
   ```bash
   cd frontend
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
     npx playwright test --config=visual-tests/playwright.config.ts
   ```
   If `@playwright/test` is missing, `npm install --ignore-scripts` first (browser
   already present). Locally without the pre-installed browser, run
   `npx playwright install chromium`.
2. Read `frontend/visual-tests/report/report.md` and `report.json`.
3. For each ❌ view, classify the cause:
   - **uncaught page error / blank screen** → a real runtime crash; the app has no
     error boundary, so one component throw blanks the whole tree. Open the
     screenshot, read the component for the route, locate the throwing line.
   - **missing expected element** → either a fixture-shape mismatch (fix the
     fixture in `fixtures.ts` / a case in `mock.ts`) or a genuine render gap.
   - **unexpected error state** ("Error Loading…") on a non-error variant → usually
     a fixture/endpoint the page needs returned the wrong shape (check the
     `unmocked` column).
   - **console errors only** → note them; not necessarily fatal.
4. Distinguish **harness issues** (wrong fixture, missing mock, wrong assertion
   string) from **real app issues** (the component crashes or renders broken with
   valid data). Fix harness issues directly (fixtures/mock/spec only). For real
   app/UI bugs, report them with the screenshot and a precise file:line — do
   **not** edit app source to make the harness pass.
5. Summarize: per-view pass/fail, the real UI issues found (with screenshots), and
   any harness fixtures you corrected.

## Limits
- Edit only files under `frontend/visual-tests/` (fixtures, mock, spec, config).
- Never modify app source (`frontend/src/**`) to force a green render — surface
  the bug instead.
- Never commit screenshots or the report (they are gitignored artifacts).
