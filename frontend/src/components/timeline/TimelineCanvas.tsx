import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Flag, ZoomIn, ZoomOut, Maximize2, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Task } from '../../hooks/useTasks'
import { useDependencies } from '../../hooks/useDependencies'
import { computeCpm } from '../canvas/cpm'
import type { ScheduleCanvasProps } from '../canvas/ScheduleCanvas'
import { parseDate, formatDate } from '../../utils/dateFormat'
import {
  DAY_MS,
  dateRange,
  visibleTasks,
  repOf,
  packLanes,
  childMapOf,
  isGroup,
  leafCount,
} from './timelineLayout'

// Time-aligned deliverable network (mirrors the prereq-mvp Canvas): a month/year
// ruler across the top, one collapsed card per deliverable placed at its start
// date (width ∝ duration), stacked into vertical lanes so dependency arrows read
// like a network. Read-only positions; expand a card to reveal its activities.
// Shares collapse state + selection with the network canvas.

const RULER_H = 52
const YEAR_H = 20
const CARD_W_MIN = 150
const CARD_H = 58
const LANE_V_GAP = 24
const LANE_H_GAP = 26
const DATE_LABEL_H = 16
const TOP_PAD = 14
const CRITICAL_COLOR = '#dc2626'
const EDGE_COLOR = '#94a3b8'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const collapseKey = (projectId: string) => `prereq:canvas-collapsed:${projectId}`

function depLabel(type: string, lag: number): string {
  if (!lag) return type
  return `${type}${lag > 0 ? '+' : ''}${lag}`
}

export default function TimelineCanvas({
  tasks,
  projectId,
  selectedTaskId,
  onSelectTask,
}: ScheduleCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { allDependencies } = useDependencies(projectId)
  const deps = useMemo(() => allDependencies || [], [allDependencies])
  const cpm = useMemo(() => computeCpm(tasks, deps), [tasks, deps])
  const childMap = useMemo(() => childMapOf(tasks), [tasks])

  const groupIds = useMemo(
    () => tasks.filter((t) => isGroup(t.id, childMap)).map((t) => t.id),
    [tasks, childMap],
  )

  // Collapse state, shared with the network canvas. Default: all groups collapsed
  // (deliverable cards) until the user expands — not persisted unless they toggle.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(collapseKey(projectId))
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>()
    } catch {
      return new Set<string>()
    }
  })
  const didDefault = useRef<boolean>(!!localStorage.getItem(collapseKey(projectId)))
  useEffect(() => {
    if (didDefault.current || !groupIds.length) return
    setCollapsed(new Set(groupIds))
    didDefault.current = true
  }, [groupIds])

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        localStorage.setItem(collapseKey(projectId), JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
    },
    [projectId],
  )
  const toggle = useCallback(
    (id: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        persist(next)
        return next
      }),
    [persist],
  )
  const collapseAll = useCallback(() => {
    const next = new Set(groupIds)
    setCollapsed(next)
    persist(next)
  }, [groupIds, persist])
  const expandAll = useCallback(() => {
    const next = new Set<string>()
    setCollapsed(next)
    persist(next)
  }, [persist])

  const [ppd, setPpd] = useState(4)

  const visible = useMemo(() => visibleTasks(tasks, collapsed), [tasks, collapsed])
  const range = useMemo(() => dateRange(visible), [visible])
  const totalDays = range ? Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1 : 0
  const contentW = Math.max(600, totalDays * ppd + 40)

  const xForTime = useCallback(
    (ms: number) => (range ? ((ms - range.start.getTime()) / DAY_MS) * ppd + 12 : 0),
    [range, ppd],
  )

  // Card geometry + lane assignment.
  const layout = useMemo(() => {
    if (!range) return { cards: [] as CardBox[], contentH: 200 }
    const raw = visible.map((t) => {
      const s = parseDate(t.startDate)
      const e = parseDate(t.endDate)
      const startMs = s ? s.getTime() : range.start.getTime()
      const endMs = e ? e.getTime() : startMs
      const left = xForTime(startMs)
      const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1)
      const width = t.isMilestone ? CARD_W_MIN : Math.max(CARD_W_MIN, days * ppd)
      return { task: t, left, width }
    })
    const lanes = packLanes(
      raw.map((r) => ({ left: r.left, width: r.width })),
      LANE_H_GAP,
    )
    const laneH = CARD_H + DATE_LABEL_H + LANE_V_GAP
    const cards: CardBox[] = raw.map((r, i) => ({
      task: r.task,
      left: r.left,
      width: r.width,
      top: RULER_H + TOP_PAD + lanes[i] * laneH,
    }))
    const laneCount = lanes.length ? Math.max(...lanes) + 1 : 1
    const contentH = RULER_H + TOP_PAD + laneCount * laneH + 20
    return { cards, contentH }
  }, [visible, range, xForTime, ppd])

  const cardById = useMemo(() => {
    const m = new Map<string, CardBox>()
    layout.cards.forEach((c) => m.set(c.task.id, c))
    return m
  }, [layout])

  // Dependency edges, bubbled to the visible representative card.
  const edges = useMemo(() => {
    const rep = repOf(tasks, collapsed)
    const seen = new Set<string>()
    const out: EdgeLine[] = []
    for (const d of deps) {
      const s = rep(d.predecessorId)
      const t = rep(d.successorId)
      if (s === t) continue
      const key = `${s}->${t}`
      if (seen.has(key)) continue
      const a = cardById.get(s)
      const b = cardById.get(t)
      if (!a || !b) continue
      seen.add(key)
      const type = d.type || 'FS'
      const px = type[0] === 'S' ? a.left : a.left + a.width
      const py = a.top + CARD_H / 2
      const sx = type[1] === 'F' ? b.left + b.width : b.left
      const sy = b.top + CARD_H / 2
      const critical = cpm.criticalEdges.has(d.id)
      const midX = (px + sx) / 2
      out.push({
        key: d.id,
        color: critical ? CRITICAL_COLOR : EDGE_COLOR,
        label: depLabel(type, d.lag),
        labelX: midX,
        labelY: (py + sy) / 2 - 6,
        d: `M ${px} ${py} C ${midX} ${py}, ${midX} ${sy}, ${sx} ${sy}`,
      })
    }
    return out
  }, [deps, tasks, collapsed, cardById, cpm])

  // Month bands for the ruler.
  const months = useMemo(() => {
    if (!range) return [] as { x: number; label: string; year: number; monthIdx: number }[]
    const out: { x: number; label: string; year: number; monthIdx: number }[] = []
    const d = new Date(range.start)
    while (d.getTime() <= range.end.getTime()) {
      out.push({ x: xForTime(d.getTime()), label: MONTHS[d.getMonth()], year: d.getFullYear(), monthIdx: d.getMonth() })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [range, xForTime])

  const years = useMemo(() => {
    const out: { x: number; label: string }[] = []
    let lastYear = -1
    for (const m of months) {
      if (m.year !== lastYear) {
        out.push({ x: m.x, label: String(m.year) })
        lastYear = m.year
      }
    }
    return out
  }, [months])

  const fit = useCallback(() => {
    const el = scrollRef.current
    if (!el || !totalDays) return
    const target = (el.clientWidth - 32) / totalDays
    setPpd(Math.max(1.5, Math.min(14, target)))
  }, [totalDays])

  // Auto-fit once when the range first becomes available.
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !range) return
    fitted.current = true
    fit()
  }, [range, fit])

  const edgeColors = Array.from(new Set(edges.map((e) => e.color)))

  if (!range || visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        No dated deliverables to place on a timeline.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <span className="mr-1 text-sm font-medium text-gray-700">Timeline</span>
        <span className="text-xs text-gray-400">
          {formatDate(range.start)} → {formatDate(range.end)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ToolbarBtn onClick={collapseAll} title="Collapse all">
            <ChevronsDownUp className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={expandAll} title="Expand all">
            <ChevronsUpDown className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-0.5 h-4 w-px bg-gray-200" />
          <ToolbarBtn onClick={() => setPpd((p) => Math.max(1.5, +(p * 0.8).toFixed(2)))} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => setPpd((p) => Math.min(14, +(p * 1.25).toFixed(2)))} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={fit} title="Fit to width">
            <Maximize2 className="h-4 w-4" />
          </ToolbarBtn>
        </div>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-slate-50/40">
        <div style={{ width: contentW, height: layout.contentH }} className="relative">
          {/* Month gridlines (behind everything) */}
          {months.map((m, i) => (
            <div
              key={i}
              className={`absolute top-0 ${m.monthIdx === 0 ? 'border-l border-gray-300' : 'border-l border-gray-200/70'}`}
              style={{ left: m.x, height: layout.contentH }}
            />
          ))}

          {/* Dependency edges (behind cards) */}
          <svg
            className="pointer-events-none absolute inset-0 z-10"
            width={contentW}
            height={layout.contentH}
          >
            <defs>
              {edgeColors.map((c) => (
                <marker
                  key={c}
                  id={`tln-arrow-${c.replace('#', '')}`}
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
            {edges.map((e) => (
              <g key={e.key}>
                <path d={e.d} fill="none" stroke={e.color} strokeWidth={1.6} markerEnd={`url(#tln-arrow-${e.color.replace('#', '')})`} />
                <text x={e.labelX} y={e.labelY} textAnchor="middle" fontSize={10} fontWeight={600} fill={e.color}>
                  {e.label}
                </text>
              </g>
            ))}
          </svg>

          {/* Cards */}
          {layout.cards.map((c) => (
            <TimelineCard
              key={c.task.id}
              box={c}
              group={isGroup(c.task.id, childMap)}
              collapsed={collapsed.has(c.task.id)}
              leaves={leafCount(c.task.id, childMap)}
              critical={!!cpm.nodes.get(c.task.id)?.critical && !isGroup(c.task.id, childMap)}
              selected={c.task.id === selectedTaskId}
              onSelect={() => onSelectTask(c.task.id)}
              onToggle={() => toggle(c.task.id)}
            />
          ))}

          {/* Ruler (sticky top; scrolls horizontally with content) */}
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
              <div key={i} className="absolute text-[11px] text-gray-500" style={{ left: m.x + 4, top: YEAR_H + 6 }}>
                {m.label}
              </div>
            ))}
            {months.map((m, i) => (
              <div key={`t${i}`} className="absolute border-l border-gray-200" style={{ left: m.x, top: YEAR_H, height: RULER_H - YEAR_H }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface CardBox {
  task: Task
  left: number
  width: number
  top: number
}

interface EdgeLine {
  key: string
  color: string
  d: string
  label: string
  labelX: number
  labelY: number
}

function ToolbarBtn({ onClick, title, children }: { onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="rounded border border-gray-300 bg-white p-1 text-gray-600 hover:bg-gray-50"
    >
      {children}
    </button>
  )
}

function TimelineCard({
  box,
  group,
  collapsed,
  leaves,
  critical,
  selected,
  onSelect,
  onToggle,
}: {
  box: CardBox
  group: boolean
  collapsed: boolean
  leaves: number
  critical: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const t = box.task

  // Milestone → diamond + label.
  if (t.isMilestone) {
    return (
      <div className="absolute z-20 flex items-center gap-1.5" style={{ left: box.left - 7, top: box.top + CARD_H / 2 - 7 }} onClick={onSelect}>
        <span
          className={`inline-block h-3.5 w-3.5 rotate-45 rounded-sm border border-white ${critical ? 'bg-red-500' : 'bg-amber-400'}`}
        />
        <span className="whitespace-nowrap rounded bg-white/80 px-1 text-[11px] font-medium text-amber-800 shadow-sm">
          <Flag className="mr-0.5 inline h-3 w-3" />
          {t.name}
        </span>
      </div>
    )
  }

  const border = selected
    ? 'border-sky-500 ring-2 ring-sky-300'
    : critical
      ? 'border-red-400 ring-1 ring-red-200'
      : group
        ? 'border-teal-400'
        : 'border-gray-300'
  const fill = group ? 'bg-teal-50/50' : 'bg-white'
  const titleColor = group ? 'text-teal-900' : 'text-gray-900'

  return (
    <>
      <div
        className={`group absolute z-20 cursor-pointer rounded-lg border ${border} ${fill} px-2 py-1.5 shadow-sm transition-colors`}
        style={{ left: box.left, top: box.top, width: box.width, height: CARD_H }}
        onClick={onSelect}
        title={`${t.name} — ${formatDate(t.startDate)} → ${formatDate(t.endDate)}`}
      >
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-0.5 font-mono text-gray-500">
            {group && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
                className="rounded p-0.5 text-gray-500 hover:bg-gray-200"
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
            {t.wbsCode || t.activityId}
          </span>
          <span className="text-gray-400">{typeof t.progress === 'number' ? t.progress : 0}%</span>
        </div>
        <div className={`truncate text-center text-[13px] font-semibold leading-tight ${titleColor}`}>{t.name}</div>
        <div className="truncate text-center text-[11px] text-gray-500">
          {group ? `${leaves} activit${leaves === 1 ? 'y' : 'ies'} · ${t.duration}d` : `${t.duration}d`}
        </div>
      </div>
      {/* Date line under the card */}
      <div
        className="absolute z-20 text-center text-[10px] text-gray-400"
        style={{ left: box.left, top: box.top + CARD_H + 1, width: box.width }}
      >
        {formatDate(t.startDate)} → {formatDate(t.endDate)}
      </div>
    </>
  )
}
