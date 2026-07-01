import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2, ChevronsDownUp, ChevronsUpDown, BarChart3, Layers, Share2 } from 'lucide-react'
import { useDependencies } from '../../hooks/useDependencies'
import { computeCpm } from '../canvas/cpm'
import type { ScheduleCanvasProps } from '../canvas/ScheduleCanvas'
import { formatDate } from '../../utils/dateFormat'
import { DAY_MS, dateRange, visibleTasks, childMapOf, isGroup } from './timelineLayout'
import { MONTHS, Ruler, ToolbarBtn, type TimelineCtx, type MonthTick } from './shared'
import { GanttBody } from './bodies/GanttBody'
import { TsldBody } from './bodies/TsldBody'
import { NetworkBody } from './bodies/NetworkBody'

// Timeline view: a shared time-scaled frame (month/year ruler, zoom, collapse,
// selection, dependency model) with three switchable schedule-presentation
// layouts — Gantt (proportional rows), Logic/TSLD (deliverable banners), and
// Network (dependency-layered cards). Shares collapse state + selection with the
// network canvas.

type Mode = 'gantt' | 'tsld' | 'network'
const modeKey = (projectId: string) => `prereq:timeline-mode:${projectId}`
const collapseKey = (projectId: string) => `prereq:canvas-collapsed:${projectId}`

export default function TimelineCanvas({ tasks, projectId, selectedTaskId, onSelectTask }: ScheduleCanvasProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { allDependencies } = useDependencies(projectId)
  const deps = useMemo(() => allDependencies || [], [allDependencies])
  const cpm = useMemo(() => computeCpm(tasks, deps), [tasks, deps])
  const childMap = useMemo(() => childMapOf(tasks), [tasks])

  const groupIds = useMemo(() => tasks.filter((t) => isGroup(t.id, childMap)).map((t) => t.id), [tasks, childMap])

  const [mode, setMode] = useState<Mode>(() => {
    try {
      return (localStorage.getItem(modeKey(projectId)) as Mode) || 'gantt'
    } catch {
      return 'gantt'
    }
  })
  const pickMode = useCallback(
    (m: Mode) => {
      setMode(m)
      try {
        localStorage.setItem(modeKey(projectId), m)
      } catch {
        /* ignore */
      }
    },
    [projectId],
  )

  // Collapse state, shared with the network canvas; default all groups collapsed.
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
  const range = useMemo(() => dateRange(mode === 'tsld' ? tasks : visible), [mode, tasks, visible])
  const totalDays = range ? Math.ceil((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1 : 0
  const contentW = Math.max(640, totalDays * ppd + 60)

  const xForTime = useCallback(
    (ms: number) => (range ? ((ms - range.start.getTime()) / DAY_MS) * ppd + 16 : 0),
    [range, ppd],
  )

  const months: MonthTick[] = useMemo(() => {
    if (!range) return []
    const out: MonthTick[] = []
    const d = new Date(range.start)
    while (d.getTime() <= range.end.getTime()) {
      out.push({ x: xForTime(d.getTime()), label: MONTHS[d.getMonth()], year: d.getFullYear(), monthIdx: d.getMonth() })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [range, xForTime])

  const fit = useCallback(() => {
    const el = scrollRef.current
    if (!el || !totalDays) return
    setPpd(Math.max(1.5, Math.min(16, (el.clientWidth - 40) / totalDays)))
  }, [totalDays])
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !range) return
    fitted.current = true
    fit()
  }, [range, fit])

  const ctx: TimelineCtx | null = useMemo(() => {
    if (!range) return null
    return {
      tasks,
      visible,
      deps,
      cpm,
      range,
      ppd,
      xForTime,
      contentW,
      months,
      childMap,
      collapsed,
      toggle,
      selectedTaskId,
      onSelectTask,
    }
  }, [tasks, visible, deps, cpm, range, ppd, xForTime, contentW, months, childMap, collapsed, toggle, selectedTaskId, onSelectTask])

  const modeBtn = (m: Mode, label: string, Icon: typeof BarChart3) => (
    <button
      onClick={() => pickMode(m)}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium transition-colors ${
        mode === m ? 'bg-sky-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="h-4 w-4" /> <span className="hidden md:inline">{label}</span>
    </button>
  )

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
          {modeBtn('gantt', 'Gantt', BarChart3)}
          {modeBtn('tsld', 'Logic', Layers)}
          {modeBtn('network', 'Network', Share2)}
        </div>
        {range && (
          <span className="ml-2 hidden text-xs text-gray-400 lg:inline">
            {formatDate(range.start)} → {formatDate(range.end)}
          </span>
        )}
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
          <ToolbarBtn onClick={() => setPpd((p) => Math.min(16, +(p * 1.25).toFixed(2)))} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn onClick={fit} title="Fit to width">
            <Maximize2 className="h-4 w-4" />
          </ToolbarBtn>
        </div>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-slate-50/40">
        {!ctx || visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            No dated activities to place on a timeline.
          </div>
        ) : (
          <div style={{ width: contentW }} className="relative">
            <Ruler months={months} contentW={contentW} />
            {mode === 'gantt' && <GanttBody ctx={ctx} />}
            {mode === 'tsld' && <TsldBody ctx={ctx} />}
            {mode === 'network' && <NetworkBody ctx={ctx} />}
          </div>
        )}
      </div>
    </div>
  )
}
