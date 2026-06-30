import { useMemo, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Flag, ZoomIn, ZoomOut } from 'lucide-react'
import { Task } from '../../hooks/useTasks'
import { useDependencies } from '../../hooks/useDependencies'
import { computeCpm } from '../canvas/cpm'
import { EDGE_COLORS } from '../canvas/flowTransform'
import type { ScheduleCanvasProps } from '../canvas/ScheduleCanvas'
import { parseDate, formatDate } from '../../utils/dateFormat'
import { wbsBar } from '../../utils/wbsColors'

// Read-only Gantt-style timeline: every activity is a bar on a horizontal date
// axis matching its start/end dates, grouped by the WBS hierarchy (collapsible
// summary rows). Dependencies are drawn as connectors. Selection syncs with the
// table/canvas via the shared selectedTaskId. A separate "canvas mode" output
// from the network/PDM canvas — different structure, same data layer.

const ROW_H = 30
const LABEL_W = 264
const HEADER_H = 46
const DAY_MS = 24 * 60 * 60 * 1000
const MIN_PPD = 5
const MAX_PPD = 60
const CRITICAL_COLOR = '#dc2626'

// Shared with the network canvas so collapse state carries across views.
const collapseKey = (projectId: string) => `prereq:canvas-collapsed:${projectId}`
function loadCollapsed(projectId: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(collapseKey(projectId)) || '[]'))
  } catch {
    return new Set()
  }
}

// Numeric WBS-code comparison ("1.2" < "1.10").
function wbsCompare(a: string, b: string): number {
  const pa = (a || '').split('.').map(Number)
  const pb = (b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

interface Row {
  task: Task
  depth: number
  hasChildren: boolean
  collapsed: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TimelineCanvas({
  tasks,
  projectId,
  selectedTaskId,
  onSelectTask,
}: ScheduleCanvasProps) {
  const { allDependencies } = useDependencies(projectId)
  const deps = useMemo(() => allDependencies || [], [allDependencies])
  const cpm = useMemo(() => computeCpm(tasks, deps), [tasks, deps])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(projectId))
  const [ppd, setPpd] = useState(20)

  const toggle = useCallback(
    (id: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        try {
          localStorage.setItem(collapseKey(projectId), JSON.stringify([...next]))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [projectId],
  )

  // WBS tree → children sorted by wbsCode.
  const { roots, childMap } = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const childMap = new Map<string, Task[]>()
    const roots: Task[] = []
    for (const t of tasks) {
      if (t.parentId && byId.has(t.parentId)) {
        const arr = childMap.get(t.parentId) || []
        arr.push(t)
        childMap.set(t.parentId, arr)
      } else {
        roots.push(t)
      }
    }
    for (const arr of childMap.values()) arr.sort((a, b) => wbsCompare(a.wbsCode, b.wbsCode))
    roots.sort((a, b) => wbsCompare(a.wbsCode, b.wbsCode))
    return { roots, childMap }
  }, [tasks])

  // Flatten to visible rows (DFS, honoring collapse).
  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (t: Task, depth: number) => {
      const kids = childMap.get(t.id) || []
      const hasChildren = kids.length > 0
      const isCollapsed = collapsed.has(t.id)
      out.push({ task: t, depth, hasChildren, collapsed: isCollapsed })
      if (hasChildren && !isCollapsed) kids.forEach((k) => walk(k, depth + 1))
    }
    roots.forEach((r) => walk(r, 0))
    return out
  }, [roots, childMap, collapsed])

  // Date axis range across all tasks.
  const range = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const t of tasks) {
      const s = parseDate(t.startDate)
      const e = parseDate(t.endDate)
      if (s) min = Math.min(min, s.getTime())
      if (e) max = Math.max(max, e.getTime())
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    // Pad a few days on each side and snap start to the 1st of the month.
    const start = new Date(min)
    start.setDate(1)
    const end = new Date(max + 5 * DAY_MS)
    return { start, end }
  }, [tasks])

  const totalDays = range ? Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1 : 0
  const contentW = totalDays * ppd
  const xForTime = useCallback(
    (ms: number) => (range ? ((ms - range.start.getTime()) / DAY_MS) * ppd : 0),
    [range, ppd],
  )

  // Bar geometry per task id (for rows + dependency anchors).
  const barById = useMemo(() => {
    const m = new Map<string, { left: number; width: number; mid: number }>()
    rows.forEach((row, i) => {
      const s = parseDate(row.task.startDate)
      const e = parseDate(row.task.endDate)
      if (!s) return
      const left = xForTime(s.getTime())
      const right = e ? xForTime(e.getTime()) + ppd : left + ppd // inclusive end day
      m.set(row.task.id, { left, width: Math.max(ppd * 0.6, right - left), mid: i * ROW_H + ROW_H / 2 })
    })
    return m
  }, [rows, xForTime, ppd])

  // Month bands for the header.
  const months = useMemo(() => {
    if (!range) return [] as { x: number; label: string }[]
    const out: { x: number; label: string }[] = []
    const d = new Date(range.start)
    while (d.getTime() <= range.end.getTime()) {
      out.push({ x: xForTime(d.getTime()), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [range, xForTime])

  // Dependency connectors between visible leaf rows.
  const arrows = useMemo(() => {
    const visible = new Set(rows.filter((r) => !r.hasChildren).map((r) => r.task.id))
    const out: { d: string; color: string; key: string }[] = []
    for (const dep of deps) {
      if (!visible.has(dep.predecessorId) || !visible.has(dep.successorId)) continue
      const p = barById.get(dep.predecessorId)
      const s = barById.get(dep.successorId)
      if (!p || !s) continue
      // Anchor x by relationship type: F* uses predecessor end, S* its start;
      // *S uses successor start, *F its end.
      const type = dep.type || 'FS'
      const px = type[0] === 'S' ? p.left : p.left + p.width
      const sx = type[1] === 'F' ? s.left + s.width : s.left
      const critical = cpm.criticalEdges.has(dep.id)
      const color = critical ? CRITICAL_COLOR : EDGE_COLORS[type] || '#64748b'
      const midX = (px + sx) / 2
      out.push({
        key: dep.id,
        color,
        d: `M ${px} ${p.mid} C ${midX} ${p.mid}, ${midX} ${s.mid}, ${sx} ${s.mid}`,
      })
    }
    return out
  }, [deps, rows, barById, cpm])

  if (!range || rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No dated activities to place on a timeline.
      </div>
    )
  }

  const arrowColors = Array.from(new Set(arrows.map((a) => a.color)))

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-sm font-medium text-gray-700">Timeline</span>
        <span className="text-xs text-gray-400">
          {formatDate(range.start)} → {formatDate(range.end)}
        </span>
        <div className="ml-auto inline-flex items-center gap-1">
          <button
            onClick={() => setPpd((p) => Math.max(MIN_PPD, Math.round(p * 0.8)))}
            title="Zoom out"
            className="rounded border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-50"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPpd((p) => Math.min(MAX_PPD, Math.round(p * 1.25)))}
            title="Zoom in"
            className="rounded border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-50"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scroll area */}
      <div className="relative flex-1 overflow-auto">
        <div style={{ width: LABEL_W + contentW }}>
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b bg-white" style={{ height: HEADER_H }}>
            <div
              className="sticky left-0 z-30 flex items-center border-r bg-white px-3 text-xs font-semibold uppercase tracking-wide text-gray-500"
              style={{ width: LABEL_W }}
            >
              Activity
            </div>
            <div className="relative" style={{ width: contentW }}>
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-gray-200" style={{ left: m.x }}>
                  <span className="absolute left-1 top-1 whitespace-nowrap text-[11px] font-medium text-gray-500">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* Dependency overlay */}
            <svg
              className="pointer-events-none absolute top-0 z-10"
              style={{ left: LABEL_W, width: contentW, height: rows.length * ROW_H }}
            >
              <defs>
                {arrowColors.map((c) => (
                  <marker
                    key={c}
                    id={`tl-arrow-${c.replace('#', '')}`}
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" fill={c} />
                  </marker>
                ))}
              </defs>
              {arrows.map((a) => (
                <path
                  key={a.key}
                  d={a.d}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={1.6}
                  markerEnd={`url(#tl-arrow-${a.color.replace('#', '')})`}
                />
              ))}
            </svg>

            {/* Month gridlines behind rows */}
            <div className="pointer-events-none absolute top-0" style={{ left: LABEL_W, width: contentW, height: rows.length * ROW_H }}>
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-gray-100" style={{ left: m.x }} />
              ))}
            </div>

            {rows.map((row) => {
              const t = row.task
              const bar = barById.get(t.id)
              const theme = wbsBar(t.wbsCode)
              const selected = t.id === selectedTaskId
              const critical = !!cpm.nodes.get(t.id)?.critical && !row.hasChildren
              return (
                <div
                  key={t.id}
                  className={`flex border-b border-gray-100 ${selected ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                  style={{ height: ROW_H }}
                  onClick={() => onSelectTask(t.id)}
                >
                  {/* Left label (frozen) */}
                  <div
                    className={`sticky left-0 z-[5] flex items-center gap-1 border-r ${selected ? 'bg-sky-50' : 'bg-white'}`}
                    style={{ width: LABEL_W, paddingLeft: 8 + row.depth * 14 }}
                  >
                    {row.hasChildren ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggle(t.id)
                        }}
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-200"
                      >
                        {row.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="font-mono text-[10px] text-gray-400">{t.wbsCode}</span>
                    <span
                      className={`truncate text-xs ${row.hasChildren ? 'font-semibold text-gray-800' : 'text-gray-600'}`}
                      title={t.name}
                    >
                      {t.name}
                    </span>
                  </div>

                  {/* Timeline cell */}
                  <div className="relative" style={{ width: contentW }}>
                    {bar &&
                      (t.isMilestone ? (
                        <div
                          className={`absolute ${critical ? 'bg-red-500' : 'bg-amber-400'} rotate-45 rounded-sm border border-white`}
                          style={{ left: bar.left - 6, top: ROW_H / 2 - 6, width: 12, height: 12 }}
                          title={`${t.name} — ${formatDate(t.startDate)}`}
                        />
                      ) : row.hasChildren ? (
                        // Summary bracket bar
                        <div
                          className="absolute rounded-sm bg-gray-400/70"
                          style={{ left: bar.left, top: ROW_H / 2 - 3, width: bar.width, height: 6 }}
                          title={`${t.name} — ${formatDate(t.startDate)} → ${formatDate(t.endDate)}`}
                        />
                      ) : (
                        <div
                          className={`absolute flex items-center overflow-hidden rounded border ${theme.fill} ${
                            critical ? 'border-red-500 ring-1 ring-red-300' : theme.border
                          }`}
                          style={{ left: bar.left, top: ROW_H / 2 - 9, width: bar.width, height: 18 }}
                          title={`${t.name} — ${formatDate(t.startDate)} → ${formatDate(t.endDate)} (${t.duration}d)`}
                        >
                          <span className={`truncate px-1 text-[10px] ${theme.text}`}>{t.name}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
