// In-browser demo backend.
//
// An axios adapter that answers the app's HTTP calls from the in-memory
// `store` (see demoData.ts) instead of hitting a real server. It is installed
// only for the demo Pages build (gated in `services/api.ts`), so the live,
// backend-less site is fully clickable: GETs return sample data, and
// create/edit/link/delete mutate the store so changes persist for the session.
//
// It mirrors the GET routing of the visual-test harness (`visual-tests/mock.ts`)
// and adds mutations the test mock doesn't need.

import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios'
import { store, type DemoTask, type DemoDependency } from './demoData'

const NOW = '2025-06-01T00:00:00Z'

function ok(config: AxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Created',
    headers: { 'content-type': 'application/json' },
    config: config as AxiosResponse['config'],
    request: {},
  }
}

function fail(config: AxiosRequestConfig, status: number, message: string): never {
  const error = new Error(message) as Error & { response?: AxiosResponse; config?: AxiosRequestConfig; isAxiosError?: boolean }
  error.isAxiosError = true
  error.config = config
  error.response = {
    data: { statusCode: status, message },
    status,
    statusText: 'Error',
    headers: {},
    config: config as AxiosResponse['config'],
    request: {},
  }
  throw error
}

// axios serializes a request body to a JSON string before the adapter runs.
function parseBody(data: unknown): any {
  if (data == null) return {}
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return {} }
  }
  return data
}

function pathOf(config: AxiosRequestConfig): string {
  const raw = config.url || ''
  // url may be absolute (baseURL applied) or relative; strip origin + query.
  const noQuery = raw.split('?')[0]
  const m = noQuery.match(/^https?:\/\/[^/]+(\/.*)$/)
  return m ? m[1] : noQuery
}

// ---- task shaping ----------------------------------------------------------

function taskRef(id: string) {
  const t = store.tasks.find((x) => x.id === id)
  return { id, activityId: t?.activityId ?? '', title: t?.title ?? '', wbsCode: t?.wbsCode ?? '' }
}

// Build the BackendTask shape useTasks expects, with predecessors/successors
// computed from the dependency store and children for header detection.
function shapeTask(t: DemoTask) {
  const predecessors = store.dependencies
    .filter((d) => d.successorId === t.id)
    .map((d) => ({ id: d.id, predecessorId: d.predecessorId, type: d.type, lag: d.lag, predecessor: taskRef(d.predecessorId) }))
  const successors = store.dependencies
    .filter((d) => d.predecessorId === t.id)
    .map((d) => ({ id: d.id, successorId: d.successorId, type: d.type, lag: d.lag, successor: taskRef(d.successorId) }))
  const children = store.tasks.filter((c) => c.parentId === t.id).map((c) => ({ id: c.id }))
  return { ...t, predecessors, successors, children }
}

function depShape(d: DemoDependency) {
  return { ...d, predecessor: taskRef(d.predecessorId), successor: taskRef(d.successorId) }
}

// ---- id / wbs generation ---------------------------------------------------

function nextWbs(parentId?: string): { wbsCode: string; level: number } {
  if (!parentId) {
    const tops = store.tasks.filter((t) => !t.parentId)
    return { wbsCode: String(tops.length + 1), level: 1 }
  }
  const parent = store.tasks.find((t) => t.id === parentId)
  if (!parent) return { wbsCode: String(store.tasks.length + 1), level: 1 }
  const siblings = store.tasks.filter((t) => t.parentId === parentId)
  return { wbsCode: `${parent.wbsCode}.${siblings.length + 1}`, level: parent.level + 1 }
}

// ---- handlers --------------------------------------------------------------

function handleGet(path: string, config: AxiosRequestConfig): AxiosResponse {
  if (path === '/auth/profile') return ok(config, store.authProfile)
  if (path === '/projects') return ok(config, store.projects)
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/projects\/([^/]+)$/))) {
    const p = store.projects.find((x) => x.id === m![1])
    return p ? ok(config, p) : fail(config, 404, 'Project not found')
  }
  if ((m = path.match(/^\/tasks\/project\/([^/]+)$/))) {
    const projectId = m[1]
    return ok(config, store.tasks.filter((t) => t.projectId === projectId).map(shapeTask))
  }
  if (path === '/portfolio/wbs') return ok(config, portfolioWbs())
  if (path === '/resources/types') return ok(config, store.resourceTypes)
  if (path === '/resources') return ok(config, store.resources)
  if ((m = path.match(/^\/tasks\/([^/]+)\/resources\/available$/))) return ok(config, store.resources)
  if ((m = path.match(/^\/tasks\/([^/]+)\/resources$/))) {
    const taskId = m[1]
    const t = store.tasks.find((x) => x.id === taskId)
    return ok(config, {
      task: t ? { id: t.id, title: t.title, activityId: t.activityId, wbsCode: t.wbsCode } : { id: taskId },
      assignments: store.assignments.filter((a) => a.taskId === taskId),
    })
  }
  if (path === '/dependencies') {
    const projectId = (config.params as any)?.projectId
    const ids = new Set(store.tasks.filter((t) => !projectId || t.projectId === projectId).map((t) => t.id))
    return ok(config, store.dependencies.filter((d) => ids.has(d.predecessorId) || ids.has(d.successorId)).map(depShape))
  }
  if ((m = path.match(/^\/dependencies\/task\/([^/]+)$/))) {
    const taskId = m[1]
    return ok(config, {
      asPredecessor: store.dependencies.filter((d) => d.predecessorId === taskId).map(depShape),
      asSuccessor: store.dependencies.filter((d) => d.successorId === taskId).map(depShape),
    })
  }
  if ((m = path.match(/^\/dependencies\/([^/]+)$/))) {
    const d = store.dependencies.find((x) => x.id === m![1])
    return d ? ok(config, depShape(d)) : fail(config, 404, 'Dependency not found')
  }
  return ok(config, [])
}

function handlePost(path: string, body: any, config: AxiosRequestConfig): AxiosResponse {
  // Auth endpoints — any credentials succeed in demo mode.
  if (path === '/auth/dev-login' || path === '/auth/login' || path === '/auth/signup' || path === '/auth/confirm-signup') {
    return ok(config, { accessToken: 'demo', user: store.authProfile })
  }
  if (path === '/tasks') {
    const { wbsCode, level } = nextWbs(body.parentId || undefined)
    const id = `t-${++store.seq.task}`
    const costLabor = Number(body.costLabor) || 0
    const costMaterial = Number(body.costMaterial) || 0
    const costOther = Number(body.costOther) || 0
    const task: DemoTask = {
      id,
      activityId: body.isMilestone ? `M${1000 + store.seq.task}` : `A${1000 + store.seq.task}`,
      title: body.title || 'New Task',
      wbsCode,
      startDate: body.startDate || '2025-07-01',
      endDate: body.endDate || body.startDate || '2025-07-01',
      isMilestone: !!body.isMilestone,
      costLabor, costMaterial, costOther,
      totalCost: costLabor + costMaterial + costOther,
      level,
      projectId: body.projectId || store.projects[0].id as string,
      parentId: body.parentId || undefined,
      description: body.description || '',
      createdAt: NOW, updatedAt: NOW,
    }
    store.tasks.push(task)
    return ok(config, shapeTask(task), 201)
  }
  if (path === '/dependencies') {
    const id = `d-${++store.seq.dep}`
    const dep: DemoDependency = {
      id,
      predecessorId: body.predecessorId,
      successorId: body.successorId,
      type: body.type || 'FS',
      lag: Number(body.lag) || 0,
      createdAt: NOW, updatedAt: NOW,
    }
    store.dependencies.push(dep)
    return ok(config, depShape(dep), 201)
  }
  if (path === '/projects') {
    const id = `proj-${++store.seq.project}`
    const project = {
      id,
      name: body.name || 'New Project',
      client: body.client || '',
      description: body.description || '',
      status: body.status || 'PLANNING',
      startDate: body.startDate || '2025-07-01',
      endDate: body.endDate || '2025-12-31',
      budget: Number(body.budget) || 0,
    }
    store.projects.push(project)
    return ok(config, project, 201)
  }
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/tasks\/([^/]+)\/resources$/))) {
    const taskId = m[1]
    const resource = store.resources.find((r) => r.id === body.resourceId)
    const t = store.tasks.find((x) => x.id === taskId)
    const assignment = {
      id: `a-${++store.seq.assignment}`,
      taskId,
      resourceId: body.resourceId,
      hours: Number(body.hours) || 0,
      createdAt: NOW, updatedAt: NOW,
      resource,
      task: t ? { id: t.id, title: t.title, activityId: t.activityId, wbsCode: t.wbsCode } : { id: taskId },
    }
    store.assignments.push(assignment)
    return ok(config, assignment, 201)
  }
  if (path === '/resources') {
    const id = `r-${++store.seq.resource}`
    const type = store.resourceTypes.find((rt) => rt.id === body.typeId)
    const resource = { id, name: body.name || 'New Resource', rateFloat: Number(body.rateFloat) || 0, typeId: body.typeId, createdAt: NOW, updatedAt: NOW, type }
    store.resources.push(resource)
    return ok(config, resource, 201)
  }
  if (path === '/resources/types') {
    const id = `rt-${++store.seq.resource}`
    const type = { id, name: body.name || 'New Type', createdAt: NOW, updatedAt: NOW }
    store.resourceTypes.push(type)
    return ok(config, type, 201)
  }
  return ok(config, {}, 201)
}

function handlePatch(path: string, body: any, config: AxiosRequestConfig): AxiosResponse {
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/tasks\/([^/]+)$/))) {
    const t = store.tasks.find((x) => x.id === m![1])
    if (!t) return fail(config, 404, 'Task not found')
    Object.assign(t, body)
    t.totalCost = (Number(t.costLabor) || 0) + (Number(t.costMaterial) || 0) + (Number(t.costOther) || 0)
    t.updatedAt = NOW
    return ok(config, shapeTask(t))
  }
  if ((m = path.match(/^\/dependencies\/([^/]+)$/))) {
    const d = store.dependencies.find((x) => x.id === m![1])
    if (!d) return fail(config, 404, 'Dependency not found')
    if (body.type !== undefined) d.type = body.type
    if (body.lag !== undefined) d.lag = Number(body.lag)
    d.updatedAt = NOW
    return ok(config, depShape(d))
  }
  if ((m = path.match(/^\/(?:resources|assignments)\/([^/]+)$/))) {
    const list = path.startsWith('/resources') ? store.resources : store.assignments
    const item = list.find((x) => x.id === m![1])
    if (item) Object.assign(item, body, { updatedAt: NOW })
    return ok(config, item ?? {})
  }
  return ok(config, {})
}

function handleDelete(path: string, config: AxiosRequestConfig): AxiosResponse {
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/tasks\/([^/]+)$/))) {
    const id = m[1]
    // Cascade: remove the task, its descendants, and any touching dependencies.
    const doomed = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const t of store.tasks) {
        if (t.parentId && doomed.has(t.parentId) && !doomed.has(t.id)) { doomed.add(t.id); grew = true }
      }
    }
    store.tasks = store.tasks.filter((t) => !doomed.has(t.id))
    store.dependencies = store.dependencies.filter((d) => !doomed.has(d.predecessorId) && !doomed.has(d.successorId))
    store.assignments = store.assignments.filter((a) => !doomed.has(a.taskId as string))
    return ok(config, {})
  }
  if ((m = path.match(/^\/dependencies\/([^/]+)$/))) {
    store.dependencies = store.dependencies.filter((d) => d.id !== m![1])
    return ok(config, {})
  }
  if ((m = path.match(/^\/projects\/([^/]+)$/))) {
    const id = m[1]
    store.projects = store.projects.filter((p) => p.id !== id)
    const taskIds = new Set(store.tasks.filter((t) => t.projectId === id).map((t) => t.id))
    store.tasks = store.tasks.filter((t) => t.projectId !== id)
    store.dependencies = store.dependencies.filter((d) => !taskIds.has(d.predecessorId) && !taskIds.has(d.successorId))
    return ok(config, {})
  }
  if ((m = path.match(/^\/(?:resources|assignments|resources\/types)\/([^/]+)$/))) {
    store.resources = store.resources.filter((r) => r.id !== m![1])
    store.assignments = store.assignments.filter((a) => a.id !== m![1])
    store.resourceTypes = store.resourceTypes.filter((rt) => rt.id !== m![1])
    return ok(config, {})
  }
  return ok(config, {})
}

// Portfolio WBS tree (single root with one child per project).
function portfolioWbs() {
  return {
    id: 'portfolio-root', title: 'Portfolio', level: 0, wbsCode: '', isMilestone: false,
    predecessors: [], successors: [],
    children: store.projects.map((p) => ({
      id: p.id as string, title: p.name as string, level: 1, wbsCode: '1', isMilestone: false,
      projectId: p.id as string,
      project: { id: p.id, name: p.name, client: p.client },
      predecessors: [], successors: [], children: [],
    })),
  }
}

export const demoAdapter: AxiosAdapter = async (config) => {
  const method = (config.method || 'get').toLowerCase()
  const path = pathOf(config)
  const body = parseBody(config.data)
  switch (method) {
    case 'get': return handleGet(path, config)
    case 'post': return handlePost(path, body, config)
    case 'patch':
    case 'put': return handlePatch(path, body, config)
    case 'delete': return handleDelete(path, config)
    default: return ok(config, {})
  }
}

export default demoAdapter
