import type { Page, Route, Request } from '@playwright/test'
import * as fx from './fixtures'

const API = 'http://localhost:3000'

export type DataMode = 'populated' | 'empty' | 'error'

export interface MockOptions {
  // Per-resource override of the response mode. Defaults to 'populated'.
  projects?: DataMode
  tasks?: DataMode
  // Seed the auth token so the app skips login. Default true; set false to
  // render the Login page itself (otherwise it redirects to '/').
  auth?: boolean
}

// Endpoints the app GETs, matched by pathname. Returns the fixture body.
function resolveBody(path: string): unknown | undefined {
  if (path === '/auth/profile') return fx.authProfile
  if (path === '/projects') return fx.projects
  if (/^\/projects\/[^/]+$/.test(path)) return fx.projectDetail
  if (/^\/tasks\/project\/[^/]+$/.test(path)) return fx.tasks
  if (path === '/portfolio/wbs') return fx.portfolioWbs
  if (path === '/resources/types') return fx.resourceTypes
  if (path === '/resources') return fx.resources
  if (/^\/tasks\/[^/]+\/resources\/available$/.test(path)) return fx.resources
  if (/^\/tasks\/[^/]+\/resources$/.test(path)) return fx.taskResources
  if (path === '/dependencies') return fx.dependencies
  if (/^\/dependencies\/task\/[^/]+$/.test(path)) return fx.taskDependencies
  // POST login endpoints (used only if the bypass is skipped)
  if (path === '/auth/dev-login' || path === '/auth/login') return { accessToken: 'test-token' }
  return undefined
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers()['origin'] || 'http://localhost:5173'
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
  }
}

// Tracks endpoints that had no fixture, surfaced in the report.
export interface MockTracker {
  unmocked: Set<string>
}

export async function installMocks(page: Page, opts: MockOptions = {}): Promise<MockTracker> {
  const tracker: MockTracker = { unmocked: new Set() }

  // Bypass login: seed the auth token before any app code runs so AuthContext
  // hydrates via GET /auth/profile (which we mock below).
  if (opts.auth !== false) {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('authToken', 'test-token') } catch { /* ignore */ }
    })
  }

  // Vite's dev server proxies /projects, /portfolio, /tasks, /auth to the
  // (absent) backend. A top-level navigation (deep link) to those paths gets
  // caught by the proxy → 500 → blank document. Real users navigate
  // client-side, so serve the SPA shell for any document request and let React
  // Router render the route in-memory.
  await page.route('http://localhost:5173/**', async (route: Route) => {
    if (route.request().resourceType() === 'document') {
      const res = await route.fetch({ url: 'http://localhost:5173/' })
      const html = await res.text()
      await route.fulfill({ status: 200, contentType: 'text/html', body: html })
      return
    }
    await route.continue()
  })

  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request()
    const method = req.method()
    const url = new URL(req.url())
    const path = url.pathname

    // CORS preflight (GET with Authorization triggers it).
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders(req), body: '' })
      return
    }

    // Deliberate error mode for a resource class.
    const isProjects = path === '/projects' || /^\/projects\/[^/]+$/.test(path)
    const isTasks = /^\/tasks\/project\/[^/]+$/.test(path)
    if ((isProjects && opts.projects === 'error') || (isTasks && opts.tasks === 'error')) {
      await route.fulfill({
        status: 500, headers: { ...corsHeaders(req), 'content-type': 'application/json' },
        body: JSON.stringify({ statusCode: 500, message: 'Simulated server error' }),
      })
      return
    }

    let body = resolveBody(path)
    if (body === undefined) {
      tracker.unmocked.add(`${method} ${path}`)
      body = [] // safe default so the UI doesn't hang
    }

    // Empty mode: blank out list-shaped resources.
    if (opts.projects === 'empty' && isProjects) body = path === '/projects' ? [] : fx.projectDetail
    if (opts.tasks === 'empty' && isTasks) body = []

    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders(req), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  })

  return tracker
}
