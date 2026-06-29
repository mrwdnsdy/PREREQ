import dagre from 'dagre'
import { MarkerType } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import { Task } from '../../hooks/useTasks'
import { TaskDependency } from '../../services/dependenciesApi'

// Node/layout geometry
export const LEAF_W = 200
export const LEAF_H = 96
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

// ---- Phase 1: pure measurement (relative positions, no React Flow yet) ----
interface Box {
  task: Task
  kind: 'group' | 'activity' | 'milestone'
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

  const leafKids = kids.filter((k) => (children.get(k.id)?.length ?? 0) === 0)
  const groupKids = kids.filter((k) => (children.get(k.id)?.length ?? 0) > 0)

  // Leaf band (dependency-ordered) at the top of the group.
  const leafLayout = layoutLeaves(leafKids, depPairs)
  const leafBoxes: Box[] = leafKids.map((l) => ({
    task: l,
    kind: l.isMilestone ? 'milestone' : ('activity' as const),
    x: PAD + leafLayout.positions[l.id].x,
    y: HEADER_H + PAD + leafLayout.positions[l.id].y,
    w: LEAF_W,
    h: LEAF_H,
    children: [],
  }))

  // Sub-groups stacked below the leaf band.
  let cursorY = HEADER_H + PAD + (leafKids.length ? leafLayout.h + GAP : 0)
  let maxChildW = leafLayout.w
  const groupBoxes: Box[] = []
  for (const sub of groupKids) {
    const box = measure(sub, children, depPairs)
    box.x = PAD
    box.y = cursorY
    groupBoxes.push(box)
    cursorY += box.h + GAP
    maxChildW = Math.max(maxChildW, box.w)
  }

  const innerBottom = groupKids.length ? cursorY - GAP : HEADER_H + PAD + leafLayout.h
  const w = Math.max(LEAF_W, maxChildW) + PAD * 2
  const h = innerBottom + PAD
  return { task, kind: 'group', x: 0, y: 0, w, h, children: [...leafBoxes, ...groupBoxes] }
}

// ---- Phase 2: emit React Flow nodes (parent-before-child) ----
function emit(
  box: Box,
  parentId: string | null,
  saved: SavedPositions,
  selectedId: string | null,
  out: Node[],
): void {
  const pos = saved[box.task.id] ?? { x: box.x, y: box.y }
  const base: Node = {
    id: box.task.id,
    type: box.kind === 'group' ? 'wbsGroup' : box.kind,
    position: pos,
    data: { task: box.task, label: `${box.task.wbsCode || ''} ${box.task.name}`.trim() },
    selected: box.task.id === selectedId,
    draggable: true,
  }
  if (parentId) {
    base.parentNode = parentId
    base.extent = 'parent'
  }
  if (box.kind === 'group') {
    base.style = { width: box.w, height: box.h }
    // Groups sit behind their children and must not swallow child clicks.
    base.zIndex = 0
  }
  out.push(base)
  for (const child of box.children) emit(child, box.task.id, saved, selectedId, out)
}

export function buildFlow(
  tasks: Task[] = [],
  deps: TaskDependency[] = [],
  saved: SavedPositions = {},
  selectedId: string | null = null,
): FlowResult {
  const children = childMap(tasks)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const depPairs = deps.map((d) => ({ s: d.predecessorId, t: d.successorId }))

  // Roots stacked vertically.
  const roots = children.get('__root__') || []
  const nodes: Node[] = []
  let cursorY = 0
  for (const root of roots) {
    const box = measure(root, children, depPairs)
    box.x = 0
    box.y = cursorY
    emit(box, null, saved, selectedId, nodes)
    // Root position may be overridden by saved drag; advance by computed height regardless.
    cursorY += box.h + ROOT_GAP
  }

  const edges: Edge[] = deps
    .filter((d) => byId.has(d.predecessorId) && byId.has(d.successorId))
    .map((d) => {
      const color = EDGE_COLORS[d.type] || '#64748b'
      return {
        id: d.id,
        source: d.predecessorId,
        target: d.successorId,
        label: depLabel(d.type, d.lag),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
        style: { stroke: color, strokeWidth: 1.8 },
        labelStyle: { fill: color, fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.85 },
        data: { dependency: d },
      } as Edge
    })

  return { nodes, edges }
}
