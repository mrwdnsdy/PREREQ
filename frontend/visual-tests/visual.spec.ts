import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { installMocks, MockOptions } from './mock'
import { PROJECT_ID } from './fixtures'

// Run from frontend/ (the skill does `cd frontend`); resolve against cwd to
// avoid __dirname (ESM project).
const HERE = path.join(process.cwd(), 'visual-tests')
const SCREENSHOT_DIR = path.join(HERE, 'screenshots')
const REPORT_DIR = path.join(HERE, 'report')

// Console messages that are noise, not real render failures.
const IGNORE = [
  'favicon',
  'React Router Future Flag',
  'Download the React DevTools',
  'AuthProvider:', // the app's own debug logs (these are console.log anyway)
]

interface ViewSpec {
  id: string
  title: string
  path: string
  opts?: MockOptions
  // Text that should be visible when the view renders correctly.
  expectText?: string
  // This view intentionally renders an error/empty state.
  allowError?: boolean
  // Optional interaction before capturing (best-effort).
  action?: (page: Page) => Promise<void>
}

const VIEWS: ViewSpec[] = [
  { id: 'login', title: 'Login', path: '/login', opts: { auth: false }, expectText: 'Sign in' },
  { id: 'dashboard', title: 'Dashboard', path: '/', expectText: 'Enterprise Software Implementation' },
  { id: 'dashboard-empty', title: 'Dashboard (empty)', path: '/', opts: { projects: 'empty' }, expectText: 'No projects', allowError: true },
  { id: 'projects', title: 'Projects list', path: '/projects', expectText: 'Enterprise Software Implementation' },
  { id: 'projects-empty', title: 'Projects (empty)', path: '/projects', opts: { projects: 'empty' }, expectText: 'No projects', allowError: true },
  { id: 'projects-error', title: 'Projects (API error)', path: '/projects', opts: { projects: 'error' }, allowError: true },
  { id: 'project-detail', title: 'Project detail + TaskTable', path: `/projects/${PROJECT_ID}`, expectText: 'Project Planning' },
  { id: 'project-detail-empty', title: 'Project detail (no tasks)', path: `/projects/${PROJECT_ID}`, opts: { tasks: 'empty' }, expectText: 'No tasks', allowError: true },
  { id: 'project-detail-error', title: 'Project detail (API error)', path: `/projects/${PROJECT_ID}`, opts: { projects: 'error' }, allowError: true },
  { id: 'schedule', title: 'Schedule page', path: `/schedule/${PROJECT_ID}` },
  { id: 'schedule-canvas', title: 'Schedule canvas (PDM)', path: `/schedule/${PROJECT_ID}?view=canvas`, expectText: 'Design Phase' },
  { id: 'schedule-canvas-empty', title: 'Schedule canvas (empty)', path: `/schedule/${PROJECT_ID}?view=canvas`, opts: { tasks: 'empty' }, expectText: 'Add a Phase', allowError: true },
  {
    id: 'schedule-canvas-collapsed', title: 'Schedule canvas (collapsed group)',
    path: `/schedule/${PROJECT_ID}?view=canvas`, expectText: 'Design Phase',
    action: async (page) => {
      // Collapse the "Development" group (t5) and re-render to capture it.
      await page.evaluate(
        (pid) => localStorage.setItem(`prereq:canvas-collapsed:${pid}`, JSON.stringify(['t5'])),
        PROJECT_ID,
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  { id: 'portfolio', title: 'Portfolio', path: '/portfolio', expectText: 'Enterprise Software Implementation' },
  { id: 'portfolio-empty', title: 'Portfolio (empty)', path: '/portfolio', opts: { projects: 'empty' }, allowError: true },
  { id: 'new-project', title: 'New Project form', path: '/projects/new' },
  { id: 'new-task', title: 'New Task form', path: `/projects/${PROJECT_ID}/tasks/new` },
  { id: 'import-schedule', title: 'Import Schedule', path: `/projects/${PROJECT_ID}/import-schedule` },
  {
    id: 'project-detail-drawer', title: 'ProjectDetail + ResourceDrawer (best-effort)',
    path: `/projects/${PROJECT_ID}`, expectText: 'Project Planning',
    action: async (page) => {
      // Best-effort: open the task detail drawer and click through its tabs.
      const row = page.getByText('Frontend Development').first()
      if (await row.isVisible().catch(() => false)) {
        await row.click({ timeout: 3000 }).catch(() => {})
      }
      for (const tab of ['Resources', 'Dependencies', 'Budget', 'Status', 'Notes']) {
        const t = page.getByRole('tab', { name: tab }).or(page.getByText(tab, { exact: true })).first()
        await t.click({ timeout: 1500 }).catch(() => {})
      }
    },
  },
]

interface Result {
  project: string
  id: string
  title: string
  path: string
  status: 'pass' | 'fail'
  consoleErrors: string[]
  pageErrors: string[]
  unmocked: string[]
  notes: string[]
  screenshot: string
}

const RESULTS_DIR = path.join(REPORT_DIR, 'results')

function relevant(text: string): boolean {
  return !IGNORE.some((p) => text.includes(p))
}

for (const view of VIEWS) {
  test(view.title, async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const notes: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error' && relevant(msg.text())) consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => {
      if (relevant(err.message)) pageErrors.push(err.message)
    })

    const tracker = await installMocks(page, view.opts)

    await page.goto(view.path, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400) // let spinners settle

    let status: 'pass' | 'fail' = 'pass'

    if (view.expectText) {
      const ok = await page
        .getByText(view.expectText, { exact: false })
        .first()
        .isVisible()
        .catch(() => false)
      if (!ok) {
        status = 'fail'
        notes.push(`expected text not visible: "${view.expectText}"`)
      }
    }

    // A render that fell into an unexpected error boundary / error state.
    if (!view.allowError) {
      const errText = await page
        .getByText(/Error Loading|Something went wrong|Unhandled/i)
        .first()
        .isVisible()
        .catch(() => false)
      if (errText) {
        status = 'fail'
        notes.push('unexpected error state visible on page')
      }
    }

    if (view.action) await view.action(page).catch((e) => notes.push(`action failed: ${e}`))

    if (pageErrors.length) {
      status = 'fail'
      notes.push(`${pageErrors.length} uncaught page error(s)`)
    }

    const dir = path.join(SCREENSHOT_DIR, project)
    fs.mkdirSync(dir, { recursive: true })
    const screenshot = path.join(dir, `${view.id}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })

    const result: Result = {
      project, id: view.id, title: view.title, path: view.path, status,
      consoleErrors, pageErrors, unmocked: [...tracker.unmocked], notes,
      screenshot: path.relative(HERE, screenshot),
    }
    // Write per-test so the report survives Playwright's per-project workers;
    // global-teardown aggregates all of them.
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
    fs.writeFileSync(path.join(RESULTS_DIR, `${project}__${view.id}.json`), JSON.stringify(result))

    // Soft expectation: surfaces in Playwright output but the report is the
    // primary artifact, so we don't hard-stop the suite on one bad view.
    expect.soft(status, `${view.title}: ${notes.join('; ')}`).toBe('pass')
  })
}
