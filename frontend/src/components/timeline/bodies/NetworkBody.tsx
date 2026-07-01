import { useMemo } from 'react'
import { Flag, ChevronDown, ChevronRight } from 'lucide-react'
import { Task } from '../../../hooks/useTasks'
import { parseDate, formatDate } from '../../../utils/dateFormat'
import { DAY_MS, isGroup, leafCount, repOf, layerByDepth, packLanes } from '../timelineLayout'
import { RULER_H, Grid, DepEdges, computeEdges, type Box, type TimelineCtx } from '../shared'

// Refined card-network: cards floated by start date with STRICTLY proportional
// widths (name overflows to the right, never stretches the bar), placed into
// dependency-depth bands (predecessors above successors) so most edges point
// forward and crossings drop. Dates live in tooltips (no colliding label lines).

const CARD_H = 42
const VGAP = 14
const BAND_GAP = 26
const BASE = RULER_H + 14
const MINW = 44

interface CardBox {
  task: Task
  left: number
  width: number
  top: number
  group: boolean
}

export function NetworkBody({ ctx }: { ctx: TimelineCtx }) {
  const { tasks, visible, deps, cpm, range, ppd, xForTime, contentW, months, childMap, collapsed, selectedTaskId, onSelectTask, toggle } = ctx

  const layout = useMemo(() => {
    const rep = repOf(tasks, collapsed)
    const visibleIds = visible.map((t) => t.id)
    const vset = new Set(visibleIds)
    // Dependency edges mapped to visible representatives (for depth layering).
    const mapped: { predecessorId: string; successorId: string }[] = []
    const seen = new Set<string>()
    for (const d of deps) {
      const s = rep(d.predecessorId)
      const t = rep(d.successorId)
      if (s === t || !vset.has(s) || !vset.has(t)) continue
      const k = `${s}->${t}`
      if (seen.has(k)) continue
      seen.add(k)
      mapped.push({ predecessorId: s, successorId: t })
    }
    const depth = layerByDepth(visibleIds, mapped)

    const barOf = (t: Task) => {
      const s = parseDate(t.startDate)
      const e = parseDate(t.endDate)
      const startMs = s ? s.getTime() : range.start.getTime()
      const endMs = e ? e.getTime() : startMs
      const left = xForTime(startMs)
      const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1)
      const width = t.isMilestone ? 14 : Math.max(MINW, days * ppd)
      return { left, width }
    }

    // Group visible by depth band; within a band pack by time into sub-lanes.
    const maxDepth = visibleIds.length ? Math.max(0, ...visibleIds.map((id) => depth.get(id) || 0)) : 0
    const cards: CardBox[] = []
    let bandTop = BASE
    for (let d = 0; d <= maxDepth; d++) {
      const inBand = visible.filter((t) => (depth.get(t.id) || 0) === d)
      if (!inBand.length) continue
      const bars = inBand.map((t) => ({ task: t, ...barOf(t) }))
      const lanes = packLanes(bars.map((b) => ({ left: b.left, width: b.width })), 20)
      const laneCount = lanes.length ? Math.max(...lanes) + 1 : 1
      bars.forEach((b, i) => {
        cards.push({ task: b.task, left: b.left, width: b.width, top: bandTop + lanes[i] * (CARD_H + VGAP), group: isGroup(b.task.id, childMap) })
      })
      bandTop += laneCount * (CARD_H + VGAP) + BAND_GAP
    }
    return { cards, contentH: bandTop + 12 }
  }, [tasks, visible, deps, collapsed, range, xForTime, ppd, childMap])

  const cardById = useMemo(() => {
    const m = new Map<string, CardBox>()
    layout.cards.forEach((c) => m.set(c.task.id, c))
    return m
  }, [layout])

  const edges = useMemo(() => {
    const rep = repOf(tasks, collapsed)
    const boxOf = (id: string): Box | undefined => {
      const c = cardById.get(id)
      return c ? { left: c.left, top: c.top, width: c.task.isMilestone ? 14 : c.width, height: CARD_H } : undefined
    }
    return computeEdges(deps, rep, boxOf, cpm.criticalEdges)
  }, [deps, cardById, cpm, tasks, collapsed])

  return (
    <div className="relative" style={{ width: contentW, height: layout.contentH }}>
      <Grid months={months} height={layout.contentH} />
      <DepEdges edges={edges} width={contentW} height={layout.contentH} showLabels />

      {layout.cards.map((c) => {
        const t = c.task
        const critical = !!cpm.nodes.get(t.id)?.critical && !c.group
        const title = `${t.name} · ${formatDate(t.startDate)} → ${formatDate(t.endDate)} · ${t.duration}d`
        if (t.isMilestone) {
          return (
            <div key={t.id} className="absolute z-20 flex items-center gap-1" style={{ left: c.left - 7, top: c.top + CARD_H / 2 - 7 }} onClick={() => onSelectTask(t.id)} title={title}>
              <span className={`rotate-45 rounded-sm border border-white ${critical ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: 14, height: 14 }} />
              <span className="whitespace-nowrap rounded bg-white/80 px-1 text-[11px] font-medium text-amber-800 shadow-sm">
                <Flag className="mr-0.5 inline h-3 w-3" />
                {t.name}
              </span>
            </div>
          )
        }
        const wide = c.width >= 92
        const border = t.id === selectedTaskId
          ? 'border-sky-500 ring-2 ring-sky-300'
          : critical
            ? 'border-red-400 ring-1 ring-red-200'
            : c.group
              ? 'border-teal-400'
              : 'border-gray-300'
        return (
          <div key={t.id} className="absolute z-20" style={{ left: c.left, top: c.top }}>
            <div
              className={`relative flex cursor-pointer flex-col justify-center rounded-lg border ${border} ${c.group ? 'bg-teal-50/60' : 'bg-white'} px-1.5 shadow-sm`}
              style={{ width: c.width, height: CARD_H }}
              onClick={() => onSelectTask(t.id)}
              title={title}
            >
              <div className="flex items-center gap-0.5 text-[10px] font-mono text-gray-500">
                {c.group && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(t.id)
                    }}
                    className="rounded p-0.5 hover:bg-gray-200"
                  >
                    {collapsed.has(t.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
                <span className="truncate">{t.wbsCode || t.activityId}</span>
                <span className="ml-auto text-gray-400">{t.duration}d</span>
              </div>
              {wide && <div className={`truncate text-[12px] font-semibold leading-tight ${c.group ? 'text-teal-900' : 'text-gray-900'}`}>{t.name}</div>}
            </div>
            {/* name to the right when the card is too narrow to hold it */}
            {!wide && (
              <span className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium text-gray-700">
                {t.name}
                {c.group ? ` · ${leafCount(t.id, childMap)} act` : ''}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
