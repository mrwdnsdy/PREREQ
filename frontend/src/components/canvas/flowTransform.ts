import dagre from 'dagre'
import { MarkerType } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import { Task } from '../../hooks/useTasks'
import { TaskDependency } from '../../services/dependenciesApi'
import type { CpmNode } from './cpm'

export interface BuildOptions {
  cpm?: Map<string, CpmNode>
  criticalEdges?: Set<string>
  showCritical?: boolean
}

const CRITICAL_COLOR = '#dc2626'

// Node/layout geometry
export const LEAF_W = 200
export const LEAF_H = 96
export const COLLAPSED_W = 240
export const COLLAPSED_H = 50
const PAD = 22
const HEADER_H = 34
const GAP = 26
const ROOT_GAP = 44

export type SavedPositions = Record<string, { x: number; y: number }>

export interface FlowResult {
  nodes: Node[]
  edges: Edge[]
}

// Edge colour per dependency type (FS/SS/FF/SF)
export const EDGE_COLORS: Record<string, string> = {
  FS: '#0284c7', // sky
  SS: '#16a34a', // green
  FF: '#9333ea', // purple
  SF: '#ea580c', // orange
}

export function depLabel(type: string, lag: number): string {
  if (!lag) return type
  return `${type}${lag > 0 ? '+' : ''}${lag}`
}

// Natural WBS ordering: "1.2" before "1.10", "1.2" before "2".
function wbsCompare(a: string, b: string): number {
  const pa = (a || '').split('.').map((n) => parseInt(n, 10))
  const pb = (b || '').split('.').map((n) => parseInt(n, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i]) ? -1 : pa[i] ?? -1
    const y = Number.isNaN(pb[i]) ? -1 : pb[i] ?? -1
    if (x !== y) return x - y
  }
  return 0
}

// ---- Phase 1: pure measurement (relative positions, no React Flow yet) ----
interface Box {
  task: Task
  kind: 'group' | 'activity' | 'milestone'
  collapsed?: boolean
  childCount?: number
  x: number
  y: number
  w: number
  h: number
  children: Box[]
}

function childMap(tasks: Task[]): Map<string, Task[]> {
  const m = new Map<string, Task[]>()
  for (const t of tasks) {
    const k = t.parentId || '__root__'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(t)
  }
  // WBS-ordered children so the canvas matches the table's row order.
  for (const list of m.values()) list.sort((a, b) => wbsCompare(a.wbsCode, b.wbsCode))
  return m
}

// Lay out a group's direct leaf children left-to-right by dependency order (dagre).
function layoutLeaves(
  leaves: Task[],
  depPairs: Array<{ s: string; t: string }>,
): { positions: Record<string, { x: number; y: number }>; w: number; h: number } {
  if (leaves.length === 0) return { positions: {}, w: 0, h: 0 }
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 64, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(leaves.map((l) => l.id))
  leaves.forEach((l) => g.setNode(l.id, { width: LEAF_W, height: LEAF_H }))
  depPairs.forEach((p) => {
    if (ids.has(p.s) && ids.has(p.t)) g.setEdge(p.s, p.t)
  })
  dagre.layout(g)
  const positions: Record<string, { x: number; y: number }> = {}
  let maxX = 0
  let maxY = 0
  leaves.forEach((l) => {
    const n = g.node(l.id)
    const x = n.x - n.width / 2
    const y = n.y - n.height / 2
    positions[l.id] = { x, y }
    maxX = Math.max(maxX, x + LEAF_W)
    maxY = Math.max(maxY, y + LEAF_H)
  })
  return { positions, w: maxX, h: maxY }
}

function measure(
  task: Task,
  children: Map<string, Task[]>,
  depPairs: Array<{ s: string; t: string }>,
  collapsed: Set<string>,
): Box {
  const kids = children.get(task.id) || []
  if (kids.length === 0) {
    return {
      task,
      kind: task.isMilestone ? 'milestone' : 'activity',
      x: 0,
      y: 0,
      w: LEAF_W,
      h: LEAF_H,
      children: [],
    }
  }

  // Collapsed group: a compact summary card, no children emitted.
  if (collapsed.has(task.id)) {
    return {
      task,
      kind: 'group',
      collapsed: true,
      childCount: kids.length,
      x: 0,
      y: 0,
      w: COLLAPSED_W,
      h: COLLAPSED_H,
      children: [],
    }
  }

  // Walk children in WBS order, interleaving leaf "bands" (consecutive leaf
  // siblings laid out left-to-right by dependency) with sub-group rows.
  const childBoxes: Box[] = []
  let cursorY = HEADER_H + PAD
  let maxChildW = 0
  let band: Task[] = []

  const flushBand = () => {
    if (!band.length) return
    const layout = layoutLeaves(band, depPairs)
    for (const l of band) {
      childBoxes.push({
        task: l,
        kind: l.isMilestone ? 'milestone' : 'activity',
        x: PAD + layout.positions[l.id].x,
        y: cursorY + layout.positions[l.id].y,
        w: LEAF_W,
        h: LEAF_H,
        children: [],
      })
    }
    maxChildW = Math.max(maxChildW, layout.w)
    cursorY += layout.h + GAP
    band = []
  }

  for (const k of kids) {
    const kIsGroup = (children.get(k.id)?.length ?? 0) > 0
    if (kIsGroup) {
      flushBand()
      const box = measure(k, children, depPairs, collapsed)
      box.x = PAD
      box.y = cursorY
      childBoxes.push(box)
      maxChildW = Math.max(maxChildW, box.w)
      cursorY += box.h + GAP
    } else {
      band.push(k)
    }
  }
  flushBand()

  const innerBottom = cursorY - GAP
  const w = Math.max(LEAF_W, maxChildW) + PAD * 2
  const h = Math.max(HEADER_H + PAD * 2, innerBottom + PAD)
  return {
    task,
    kind: 'group',
    collapsed: false,
    childCount: kids.length,
    x: 0,
    y: 0,
    w,
    h,
    children: childBoxes,
  }
}

// ---- Phase 2: emit React Flow nodes (parent-before-child) ----
function emit(
  box: Box,
  parentId: string | null,
  saved: SavedPositions,
  selectedId: string | null,
  out: Node[],
  opts: BuildOptions,
): void {
  // Group boxes ALWAYS use the computed layout position so phases (and nested
  // sub-groups) reflow on expand/collapse and can never overlap. Only leaf
  // nodes honor a saved manual-drag position (relative to their parent group).
  const pos = box.kind === 'group' ? { x: box.x, y: box.y } : (saved[box.task.id] ?? { x: box.x, y: box.y })
  const cpm = opts.cpm?.get(box.task.id)
  const base: Node = {
    id: box.task.id,
    type: box.kind === 'group' ? 'wbsGroup' : box.kind,
    position: pos,
    data: {
      task: box.task,
      label: `${box.task.wbsCode || ''} ${box.task.name}`.trim(),
      collapsed: box.collapsed,
      childCount: box.childCount,
      cpm,
      showCritical: opts.showCritical,
    },
    selected: box.task.id === selectedId,
    draggable: true,
  }
  if (parentId) {
    base.parentNode = parentId
    base.extent = 'parent'
  }
  if (box.kind === 'group') {
    base.style = { width: box.w, height: box.h }
    base.zIndex = 0
  }
  out.push(base)
  for (const child of box.children) emit(child, box.task.id, saved, selectedId, out, opts)
}

// Map a task to the shallowest collapsed ancestor that hides it (or itself if visible).
function makeRep(tasks: Task[], collapsed: Set<string>): (id: string) => string {
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

export function buildFlow(
  tasks: Task[] = [],
  deps: TaskDependency[] = [],
  saved: SavedPositions = {},
  selectedId: string | null = null,
  collapsed: Set<string> = new Set(),
  opts: BuildOptions = {},
): FlowResult {
  const children = childMap(tasks)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const depPairs = deps.map((d) => ({ s: d.predecessorId, t: d.successorId }))

  // Roots stacked vertically (WBS order).
  const roots = children.get('__root__') || []
  const nodes: Node[] = []
  let cursorY = 0
  for (const root of roots) {
    const box = measure(root, children, depPairs, collapsed)
    box.x = 0
    box.y = cursorY
    emit(box, null, saved, selectedId, nodes, opts)
    cursorY += box.h + ROOT_GAP
  }

  // Edges: remap endpoints hidden inside a collapsed group up to that group,
  // drop self-loops, and dedupe so a collapsed group shows one aggregated link.
  const rep = makeRep(tasks, collapsed)
  const seen = new Set<string>()
  const edges: Edge[] = []
  for (const d of deps) {
    if (!byId.has(d.predecessorId) || !byId.has(d.successorId)) continue
    const source = rep(d.predecessorId)
    const target = rep(d.successorId)
    if (source === target) continue
    const key = `${source}->${target}`
    if (seen.has(key)) continue
    seen.add(key)
    const bubbled = source !== d.predecessorId || target !== d.successorId
    const isCritical = !!opts.showCritical && !!opts.criticalEdges?.has(d.id)
    const color = isCritical ? CRITICAL_COLOR : EDGE_COLORS[d.type] || '#64748b'
    edges.push({
      id: d.id,
      source,
      target,
      // Anchor to the right→left side strips so existing links keep their clean
      // left-to-right routing now that nodes expose handles on all four sides.
      sourceHandle: 'right',
      targetHandle: 'left',
      label: bubbled ? undefined : depLabel(d.type, d.lag),
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      zIndex: isCritical ? 5 : undefined,
      style: {
        stroke: color,
        strokeWidth: isCritical ? 2.6 : 1.8,
        ...(bubbled ? { strokeDasharray: '5 4' } : {}),
      },
      labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
      data: { dependency: d, bubbled },
    } as Edge)
  }

  return { nodes, edges }
}
