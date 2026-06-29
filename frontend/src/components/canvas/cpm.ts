import { Task } from '../../hooks/useTasks'
import { TaskDependency } from '../../services/dependenciesApi'

// Critical Path Method over the leaf-activity dependency network.
// Works in abstract day offsets (calendar days, no working-time calendar),
// supporting FS/SS/FF/SF relationships with lag.

export interface CpmNode {
  es: number // early start (day offset)
  ef: number // early finish
  ls: number // late start
  lf: number // late finish
  float: number // total float (slack) in days
  critical: boolean
}

export interface CpmResult {
  nodes: Map<string, CpmNode>
  criticalEdges: Set<string> // dependency ids on the critical path
  projectStart: Date | null
  projectEnd: number // day offset of project finish
}

function duration(t: Task): number {
  if (t.isMilestone) return 0
  return Math.max(0, t.duration || 0)
}

export function computeCpm(tasks: Task[], deps: TaskDependency[]): CpmResult {
  // Only leaf tasks (no children) are schedulable activities/milestones.
  const parentIds = new Set<string>()
  tasks.forEach((t) => t.parentId && parentIds.add(t.parentId))
  const leaves = tasks.filter((t) => !parentIds.has(t.id))
  const leafIds = new Set(leaves.map((l) => l.id))
  const byId = new Map(leaves.map((l) => [l.id, l]))
  const edges = deps.filter((d) => leafIds.has(d.predecessorId) && leafIds.has(d.successorId))

  const succ = new Map<string, TaskDependency[]>()
  const pred = new Map<string, TaskDependency[]>()
  leaves.forEach((l) => {
    succ.set(l.id, [])
    pred.set(l.id, [])
  })
  edges.forEach((d) => {
    succ.get(d.predecessorId)!.push(d)
    pred.get(d.successorId)!.push(d)
  })

  // Topological order (Kahn). On a cycle, append leftovers so we never crash.
  const indeg = new Map<string, number>()
  leaves.forEach((l) => indeg.set(l.id, pred.get(l.id)!.length))
  const queue = leaves.filter((l) => indeg.get(l.id) === 0).map((l) => l.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    succ.get(id)!.forEach((d) => {
      indeg.set(d.successorId, (indeg.get(d.successorId) || 0) - 1)
      if (indeg.get(d.successorId) === 0) queue.push(d.successorId)
    })
  }
  if (order.length < leaves.length) {
    const inOrder = new Set(order)
    leaves.forEach((l) => !inOrder.has(l.id) && order.push(l.id))
  }

  // Forward pass: early start/finish.
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const id of order) {
    const t = byId.get(id)!
    let start = 0
    for (const d of pred.get(id)!) {
      const pES = es.get(d.predecessorId) ?? 0
      const pEF = ef.get(d.predecessorId) ?? 0
      const lag = d.lag || 0
      let req: number
      switch (d.type) {
        case 'SS': req = pES + lag; break
        case 'FF': req = pEF + lag - duration(t); break
        case 'SF': req = pES + lag - duration(t); break
        default: req = pEF + lag // FS
      }
      start = Math.max(start, req)
    }
    start = Math.max(0, start)
    es.set(id, start)
    ef.set(id, start + duration(t))
  }
  const projectEnd = leaves.length ? Math.max(...leaves.map((l) => ef.get(l.id) ?? 0)) : 0

  // Backward pass: late start/finish.
  const lf = new Map<string, number>()
  const ls = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const t = byId.get(id)!
    const outs = succ.get(id)!
    // Late finish never exceeds the project end; successor links can only pull
    // it earlier. (Initialising at projectEnd is what keeps end-driving
    // activities on the critical path even when their only successor is a
    // non-binding SS/SF link.)
    let finish = projectEnd
    for (const d of outs) {
      const sLS = ls.get(d.successorId) ?? projectEnd
      const sLF = lf.get(d.successorId) ?? projectEnd
      const lag = d.lag || 0
      let allowed: number
      switch (d.type) {
        case 'SS': allowed = sLS - lag + duration(t); break
        case 'FF': allowed = sLF - lag; break
        case 'SF': allowed = sLF - lag + duration(t); break
        default: allowed = sLS - lag // FS
      }
      finish = Math.min(finish, allowed)
    }
    lf.set(id, finish)
    ls.set(id, finish - duration(t))
  }

  const nodes = new Map<string, CpmNode>()
  leaves.forEach((l) => {
    const e = es.get(l.id) ?? 0
    const f = ef.get(l.id) ?? 0
    const lFin = lf.get(l.id) ?? projectEnd
    const lSt = ls.get(l.id) ?? 0
    const float = Math.round((lSt - e) * 100) / 100
    nodes.set(l.id, { es: e, ef: f, ls: lSt, lf: lFin, float, critical: float <= 0.0001 })
  })

  // An edge is critical when both ends are critical and the link is binding.
  const criticalEdges = new Set<string>()
  edges.forEach((d) => {
    const a = nodes.get(d.predecessorId)
    const b = nodes.get(d.successorId)
    if (!a?.critical || !b?.critical) return
    const lag = d.lag || 0
    const binding =
      d.type === 'SS' ? Math.abs(a.es + lag - b.es) < 0.5 :
      d.type === 'FF' ? Math.abs(a.ef + lag - b.ef) < 0.5 :
      d.type === 'SF' ? Math.abs(a.es + lag - b.ef) < 0.5 :
      Math.abs(a.ef + lag - b.es) < 0.5 // FS
    if (binding) criticalEdges.add(d.id)
  })

  const times = leaves
    .map((l) => new Date(l.startDate).getTime())
    .filter((t) => !Number.isNaN(t))
  const projectStart = times.length ? new Date(Math.min(...times)) : null

  return { nodes, criticalEdges, projectStart, projectEnd }
}

// Derive concrete start/finish dates from the forward pass (early dates),
// preserving each activity's duration. Returns only the rows that change.
export function scheduleDates(
  tasks: Task[],
  cpm: CpmResult,
): Array<{ id: string; startDate: string; endDate: string }> {
  if (!cpm.projectStart) return []
  const parentIds = new Set<string>()
  tasks.forEach((t) => t.parentId && parentIds.add(t.parentId))
  const iso = (d: Date) => d.toISOString().split('T')[0]
  const base = cpm.projectStart
  const updates: Array<{ id: string; startDate: string; endDate: string }> = []
  for (const t of tasks) {
    if (parentIds.has(t.id)) continue // skip WBS groups
    const c = cpm.nodes.get(t.id)
    if (!c) continue
    const start = new Date(base)
    start.setDate(start.getDate() + Math.round(c.es))
    const dur = t.isMilestone ? 0 : Math.max(1, t.duration || 1)
    const end = new Date(start)
    end.setDate(end.getDate() + Math.max(0, dur - 1))
    const sISO = iso(start)
    const eISO = iso(end)
    if (sISO !== (t.startDate || '').split('T')[0] || eISO !== (t.endDate || '').split('T')[0]) {
      updates.push({ id: t.id, startDate: sISO, endDate: eISO })
    }
  }
  return updates
}
