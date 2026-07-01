import { type ReactNode } from 'react'
import { Task } from '../../hooks/useTasks'
import { TaskDependency } from '../../services/dependenciesApi'
import type { CpmResult } from '../canvas/cpm'
import { orthogonalPath } from './timelineLayout'

// Shared chrome + context for the three Timeline layouts (Gantt / TSLD / Network).
// Each body renderer receives the same TimelineCtx and supplies its own geometry.

export const RULER_H = 46
export const YEAR_H = 20
export const CRITICAL_COLOR = '#dc2626'
export const EDGE_COLOR = '#94a3b8'
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthTick {
  x: number
  label: string
  year: number
  monthIdx: number
}

export interface TimelineCtx {
  tasks: Task[]
  visible: Task[]
  deps: TaskDependency[]
  cpm: CpmResult
  range: { start: Date; end: Date }
  ppd: number
  xForTime: (ms: number) => number
  contentW: number
  months: MonthTick[]
  childMap: Map<string, Task[]>
  collapsed: Set<string>
  toggle: (id: string) => void
  selectedTaskId: string | null
  onSelectTask: (id: string | null) => void
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface EdgeModel {
  key: string
  d: string
  color: string
  label: string
  labelX: number
  labelY: number
}

function depLabel(type: string, lag: number): string {
  if (!lag) return type
  return `${type}${lag > 0 ? '+' : ''}${lag}`
}

// Build orthogonal dependency connectors between visible boxes. `rep` bubbles a
// hidden endpoint up to its visible representative; `boxOf` gives each visible id
// its rectangle. Anchor sides follow the relationship type (F*→right, S*→left…).
export function computeEdges(
  deps: TaskDependency[],
  rep: (id: string) => string,
  boxOf: (id: string) => Box | undefined,
  criticalEdges: Set<string>,
): EdgeModel[] {
  const seen = new Set<string>()
  const out: EdgeModel[] = []
  for (const d of deps) {
    const s = rep(d.predecessorId)
    const t = rep(d.successorId)
    if (s === t) continue
    const key = `${s}->${t}`
    if (seen.has(key)) continue
    const a = boxOf(s)
    const b = boxOf(t)
    if (!a || !b) continue
    seen.add(key)
    const type = d.type || 'FS'
    const ax = type[0] === 'S' ? a.left : a.left + a.width
    const ay = a.top + a.height / 2
    const bx = type[1] === 'F' ? b.left + b.width : b.left
    const by = b.top + b.height / 2
    out.push({
      key: d.id,
      color: criticalEdges.has(d.id) ? CRITICAL_COLOR : EDGE_COLOR,
      label: depLabel(type, d.lag),
      labelX: (ax + bx) / 2,
      labelY: Math.min(ay, by) - 5,
      d: orthogonalPath(ax, ay, bx, by),
    })
  }
  return out
}

// SVG overlay drawing the dependency connectors + arrowheads.
export function DepEdges({ edges, height, width, showLabels = true }: { edges: EdgeModel[]; height: number; width: number; showLabels?: boolean }) {
  const colors = Array.from(new Set(edges.map((e) => e.color)))
  return (
    <svg className="pointer-events-none absolute inset-0 z-10" width={width} height={height}>
      <defs>
        {colors.map((c) => (
          <marker key={c} id={`tl-ar-${c.replace('#', '')}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={c} />
          </marker>
        ))}
      </defs>
      {edges.map((e) => (
        <g key={e.key}>
          <path d={e.d} fill="none" stroke={e.color} strokeWidth={1.5} markerEnd={`url(#tl-ar-${e.color.replace('#', '')})`} />
          {showLabels && (
            <text x={e.labelX} y={e.labelY} textAnchor="middle" fontSize={9} fontWeight={600} fill={e.color}>
              {e.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

// Vertical month gridlines spanning the body area (drawn behind content).
export function Grid({ months, height }: { months: MonthTick[]; height: number }) {
  return (
    <>
      {months.map((m, i) => (
        <div
          key={i}
          className={`absolute top-0 ${m.monthIdx === 0 ? 'border-l border-gray-300' : 'border-l border-gray-200/70'}`}
          style={{ left: m.x, height }}
        />
      ))}
    </>
  )
}

// Sticky month/year ruler across the top of the scroll area.
export function Ruler({ months, contentW }: { months: MonthTick[]; contentW: number }) {
  const years: { x: number; label: string }[] = []
  let last = -1
  for (const m of months) {
    if (m.year !== last) {
      years.push({ x: m.x, label: String(m.year) })
      last = m.year
    }
  }
  return (
    <div
      className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur"
      style={{ width: contentW, height: RULER_H }}
    >
      {years.map((y, i) => (
        <div key={i} className="absolute font-semibold text-gray-700" style={{ left: y.x + 4, top: 2, fontSize: 12 }}>
          {y.label}
        </div>
      ))}
      {months.map((m, i) => (
        <div key={i} className="absolute text-[11px] text-gray-500" style={{ left: m.x + 4, top: YEAR_H + 4 }}>
          {m.label}
        </div>
      ))}
      {months.map((m, i) => (
        <div key={`t${i}`} className="absolute border-l border-gray-200" style={{ left: m.x, top: YEAR_H, height: RULER_H - YEAR_H }} />
      ))}
    </div>
  )
}

export function ToolbarBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded border p-1 ${active ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
    >
      {children}
    </button>
  )
}
