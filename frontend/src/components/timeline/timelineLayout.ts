import { Task } from '../../hooks/useTasks'
import { parseDate } from '../../utils/dateFormat'

// Pure layout helpers for the time-aligned deliverable network (TimelineCanvas).
// No DOM — just data → geometry, so the component stays thin and testable.

export const DAY_MS = 24 * 60 * 60 * 1000

export interface Range {
  start: Date
  end: Date
}

function childMapOf(tasks: Task[]): Map<string, Task[]> {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const m = new Map<string, Task[]>()
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      const arr = m.get(t.parentId) || []
      arr.push(t)
      m.set(t.parentId, arr)
    }
  }
  return m
}

export function isGroup(id: string, childMap: Map<string, Task[]>): boolean {
  return (childMap.get(id)?.length || 0) > 0
}

// Number of leaf (activity/milestone) descendants under a task.
export function leafCount(id: string, childMap: Map<string, Task[]>): number {
  const kids = childMap.get(id)
  if (!kids || kids.length === 0) return 0
  let n = 0
  for (const k of kids) {
    if (isGroup(k.id, childMap)) n += leafCount(k.id, childMap)
    else n += 1
  }
  return n
}

// Numeric WBS-code comparison ("1.2" < "1.10").
export function wbsCompare(a: string, b: string): number {
  const pa = (a || '').split('.').map(Number)
  const pb = (b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

// The "deliverable frontier": a task is shown iff every ancestor is expanded, and
// it is either a leaf or a COLLAPSED group. Expanded groups render nothing (their
// children show). Default (all groups collapsed) → top-level deliverable cards.
export function visibleTasks(tasks: Task[], collapsed: Set<string>): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const childMap = childMapOf(tasks)
  const anyAncestorCollapsed = (t: Task): boolean => {
    let cur = t.parentId ? byId.get(t.parentId) : undefined
    while (cur) {
      if (collapsed.has(cur.id)) return true
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return false
  }
  return tasks
    .filter((t) => {
      if (anyAncestorCollapsed(t)) return false
      if (!isGroup(t.id, childMap)) return true // leaf
      return collapsed.has(t.id) // group only shown when collapsed
    })
    .sort((a, b) => wbsCompare(a.wbsCode, b.wbsCode))
}

// Map any task id to its visible representative: the shallowest collapsed ancestor
// that hides it, or the id itself when visible. Mirrors flowTransform.makeRep so
// dependency edges "bubble" to the collapsed deliverable card.
export function repOf(tasks: Task[], collapsed: Set<string>): (id: string) => string {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cache = new Map<string, string>()
  return function rep(id: string): string {
    const cached = cache.get(id)
    if (cached) return cached
    const chain: string[] = []
    let cur: Task | undefined = byId.get(id)
    while (cur) {
      chain.push(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    let r = id
    for (let i = chain.length - 1; i >= 0; i--) {
      if (collapsed.has(chain[i])) {
        r = chain[i]
        break
      }
    }
    cache.set(id, r)
    return r
  }
}

// Axis range across the given tasks; start snapped to the 1st of its month, end
// padded a few days for breathing room.
export function dateRange(tasks: Task[]): Range | null {
  let min = Infinity
  let max = -Infinity
  for (const t of tasks) {
    const s = parseDate(t.startDate)
    const e = parseDate(t.endDate)
    if (s) min = Math.min(min, s.getTime())
    if (e) max = Math.max(max, e.getTime())
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const start = new Date(min)
  start.setDate(1)
  const end = new Date(max + 5 * DAY_MS)
  return { start, end }
}

// Greedy first-fit lane packing: items sorted by left edge, each placed in the
// first lane whose last card's right edge + gap ≤ this card's left. Returns a
// lane index per input item (input order preserved).
export function packLanes(items: { left: number; width: number }[], gap: number): number[] {
  const order = items
    .map((it, i) => ({ i, left: it.left, right: it.left + it.width }))
    .sort((a, b) => a.left - b.left)
  const laneRight: number[] = []
  const lane = new Array(items.length).fill(0)
  for (const o of order) {
    let placed = false
    for (let l = 0; l < laneRight.length; l++) {
      if (o.left >= laneRight[l] + gap) {
        lane[o.i] = l
        laneRight[l] = o.right
        placed = true
        break
      }
    }
    if (!placed) {
      lane[o.i] = laneRight.length
      laneRight.push(o.right)
    }
  }
  return lane
}

export { childMapOf }
