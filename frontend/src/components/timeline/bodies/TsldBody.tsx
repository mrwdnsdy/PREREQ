import { useMemo } from 'react'
import { Flag } from 'lucide-react'
import { Task } from '../../../hooks/useTasks'
import { parseDate, formatDate } from '../../../utils/dateFormat'
import { DAY_MS, isGroup, wbsCompare, bandFor, packLanes } from '../timelineLayout'
import { RULER_H, Grid, DepEdges, computeEdges, type Box, type TimelineCtx } from '../shared'

// Time-Scaled Logic Diagram (P6 Visualizer style): each top-level deliverable is
// a banner band spanning its date range; its activities are placed as small bars
// on shared lanes inside the band (multiple per line), joined by relational links.
// Critical path in red.

const BAND_HEADER = 22
const ACT_H = 18
const LANE_H = ACT_H + 7
const BAND_PAD = 8
const BAND_GAP = 16
const BAND_TOP0 = RULER_H + 10

interface ActBox {
  task: Task
  left: number
  width: number
  top: number
}

export function TsldBody({ ctx }: { ctx: TimelineCtx }) {
  const { tasks, deps, cpm, range, ppd, xForTime, contentW, months, childMap, selectedTaskId, onSelectTask } = ctx

  const model = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const topLevel = tasks
      .filter((t) => !t.parentId || !byId.has(t.parentId))
      .sort((a, b) => wbsCompare(a.wbsCode, b.wbsCode))

    const leavesUnder = (t: Task): Task[] => {
      if (!isGroup(t.id, childMap)) return [t]
      return (childMap.get(t.id) || []).flatMap(leavesUnder)
    }

    const barOf = (t: Task) => {
      const s = parseDate(t.startDate)
      const e = parseDate(t.endDate)
      const startMs = s ? s.getTime() : range.start.getTime()
      const endMs = e ? e.getTime() : startMs
      const left = xForTime(startMs)
      const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1)
      const width = t.isMilestone ? 12 : Math.max(6, days * ppd)
      return { left, width }
    }

    const bands: { task: Task; x: number; w: number; top: number; height: number; isGroup: boolean }[] = []
    const acts: ActBox[] = []
    let cursorY = BAND_TOP0

    for (const top of topLevel) {
      const grouped = isGroup(top.id, childMap)
      const band = bandFor(top.id, tasks, childMap)
      const bx = band ? xForTime(band.startMs) : barOf(top).left
      const bw = band ? Math.max(40, xForTime(band.endMs) - bx + ppd) : barOf(top).width
      const leaves = leavesUnder(top)
      const bars = leaves.map((t) => ({ task: t, ...barOf(t) }))
      const lanes = packLanes(
        bars.map((b) => ({ left: b.left, width: b.width })),
        24,
      )
      const laneCount = lanes.length ? Math.max(...lanes) + 1 : 1
      const height = BAND_HEADER + laneCount * LANE_H + BAND_PAD
      bars.forEach((b, i) => {
        acts.push({ task: b.task, left: b.left, width: b.width, top: cursorY + BAND_HEADER + lanes[i] * LANE_H })
      })
      bands.push({ task: top, x: bx, w: bw, top: cursorY, height, isGroup: grouped })
      cursorY += height + BAND_GAP
    }

    return { bands, acts, contentH: cursorY + 12 }
  }, [tasks, childMap, range, xForTime, ppd])

  const actById = useMemo(() => {
    const m = new Map<string, ActBox>()
    model.acts.forEach((a) => m.set(a.task.id, a))
    return m
  }, [model])

  const edges = useMemo(() => {
    const boxOf = (id: string): Box | undefined => {
      const a = actById.get(id)
      return a ? { left: a.left, top: a.top + (a.task.isMilestone ? 0 : ACT_H / 2 - 6), width: a.task.isMilestone ? 12 : a.width, height: 12 } : undefined
    }
    return computeEdges(deps, (id) => id, boxOf, cpm.criticalEdges)
  }, [deps, actById, cpm])

  return (
    <div className="relative" style={{ width: contentW, height: model.contentH }}>
      <Grid months={months} height={model.contentH} />

      {/* Deliverable banners */}
      {model.bands.map((b) => (
        <div
          key={b.task.id}
          className={`absolute rounded-lg border ${b.isGroup ? 'border-teal-300 bg-teal-50/50' : 'border-gray-300 bg-white/60'}`}
          style={{ left: b.x, top: b.top, width: b.w, height: b.height }}
          onClick={() => onSelectTask(b.task.id)}
        >
          <div className="truncate px-2 py-0.5 text-[11px] font-semibold text-teal-900">
            {b.task.wbsCode ? b.task.wbsCode + ' ' : ''}
            {b.task.name}
          </div>
        </div>
      ))}

      <DepEdges edges={edges} width={contentW} height={model.contentH} showLabels={false} />

      {/* Activity bars inside banners */}
      {model.acts.map((a) => {
        const t = a.task
        const critical = !!cpm.nodes.get(t.id)?.critical
        const title = `${t.name} · ${formatDate(t.startDate)} → ${formatDate(t.endDate)} · ${t.duration}d`
        if (t.isMilestone) {
          return (
            <div key={t.id} className="absolute z-20 flex items-center gap-1" style={{ left: a.left - 6, top: a.top + ACT_H / 2 - 6 }} onClick={() => onSelectTask(t.id)} title={title}>
              <span className={`rotate-45 rounded-sm border border-white ${critical ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: 12, height: 12 }} />
              <span className="whitespace-nowrap text-[10px] font-medium text-amber-800">
                <Flag className="mr-0.5 inline h-3 w-3" />
                {t.name}
              </span>
            </div>
          )
        }
        return (
          <div
            key={t.id}
            className={`absolute z-20 flex cursor-pointer items-center overflow-hidden rounded ${
              critical ? 'bg-red-100 ring-1 ring-red-400' : t.id === selectedTaskId ? 'bg-sky-100 ring-1 ring-sky-400' : 'bg-sky-500/85'
            }`}
            style={{ left: a.left, top: a.top, width: a.width, height: ACT_H }}
            onClick={() => onSelectTask(t.id)}
            title={title}
          >
            {a.width >= 46 && (
              <span className={`truncate px-1 text-[10px] font-medium ${critical ? 'text-red-800' : 'text-white'}`}>{t.name}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
