import { useMemo } from 'react'
import { Flag } from 'lucide-react'
import { parseDate, formatDate } from '../../../utils/dateFormat'
import { DAY_MS, isGroup, leafCount, repOf } from '../timelineLayout'
import { RULER_H, Grid, DepEdges, computeEdges, type Box, type TimelineCtx } from '../shared'

// Logic-linked Gantt: one row per visible task in WBS order, bars proportional to
// duration, labels on/beside the bars (no left column), orthogonal dependency
// arrows, red critical path, milestones as diamonds.

const ROW_H = 30
const BAR_H = 16
const LABEL_MIN = 66 // min bar width to fit the name inside

export function GanttBody({ ctx }: { ctx: TimelineCtx }) {
  const { visible, deps, cpm, range, ppd, xForTime, contentW, months, childMap, collapsed, selectedTaskId, onSelectTask } = ctx

  const rows = useMemo(() => {
    return visible.map((t, i) => {
      const s = parseDate(t.startDate)
      const e = parseDate(t.endDate)
      const startMs = s ? s.getTime() : range.start.getTime()
      const endMs = e ? e.getTime() : startMs
      const left = xForTime(startMs)
      const days = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1)
      const width = t.isMilestone ? 12 : Math.max(6, days * ppd)
      const top = RULER_H + i * ROW_H
      const barTop = top + (ROW_H - BAR_H) / 2
      return { task: t, i, left, width, top, barTop, group: isGroup(t.id, childMap) }
    })
  }, [visible, range, xForTime, ppd, childMap])

  const contentH = RULER_H + rows.length * ROW_H + 16

  const edges = useMemo(() => {
    const rep = repOf(ctx.tasks, collapsed)
    const boxOf = (id: string): Box | undefined => {
      const r = rows.find((x) => x.task.id === id)
      return r ? { left: r.left, top: r.barTop, width: r.width, height: BAR_H } : undefined
    }
    return computeEdges(deps, rep, boxOf, cpm.criticalEdges)
  }, [rows, deps, collapsed, cpm, ctx.tasks])

  return (
    <div className="relative" style={{ width: contentW, height: contentH }}>
      <Grid months={months} height={contentH} />

      {/* Row stripes */}
      {rows.map((r) => (
        <div
          key={`s${r.task.id}`}
          className={`absolute left-0 cursor-pointer ${r.i % 2 ? 'bg-slate-50/50' : ''} ${r.task.id === selectedTaskId ? '!bg-sky-50' : 'hover:bg-slate-100/60'}`}
          style={{ top: r.top, height: ROW_H, width: contentW }}
          onClick={() => onSelectTask(r.task.id)}
        />
      ))}

      <DepEdges edges={edges} width={contentW} height={contentH} showLabels={false} />

      {/* Bars + labels */}
      {rows.map((r) => {
        const t = r.task
        const critical = !!cpm.nodes.get(t.id)?.critical && !r.group
        const labelInside = !t.isMilestone && !r.group && r.width >= LABEL_MIN
        const name = `${t.wbsCode ? t.wbsCode + ' ' : ''}${t.name}`
        const title = `${t.name} · ${formatDate(t.startDate)} → ${formatDate(t.endDate)} · ${t.duration}d`
        return (
          <div key={t.id} className="pointer-events-none absolute z-20" style={{ top: r.top, left: 0, height: ROW_H, width: contentW }}>
            {t.isMilestone ? (
              <>
                <span
                  className={`absolute rotate-45 rounded-sm border border-white ${critical ? 'bg-red-500' : 'bg-amber-400'}`}
                  style={{ left: r.left - 6, top: (ROW_H - 12) / 2, width: 12, height: 12 }}
                  title={title}
                />
                <span className="absolute whitespace-nowrap text-[11px] font-medium text-amber-800" style={{ left: r.left + 10, top: (ROW_H - 14) / 2 }}>
                  <Flag className="mr-0.5 inline h-3 w-3" />
                  {t.name}
                </span>
              </>
            ) : r.group ? (
              <>
                {/* summary bracket bar */}
                <div
                  className={`absolute rounded-sm ${critical ? 'bg-red-400' : 'bg-slate-500'}`}
                  style={{ left: r.left, top: (ROW_H - 7) / 2, width: r.width, height: 7 }}
                  title={title}
                />
                <span className="absolute whitespace-nowrap text-[11px] font-semibold text-slate-700" style={{ left: r.left + r.width + 6, top: (ROW_H - 14) / 2 }}>
                  {name} · {leafCount(t.id, childMap)} act · {t.duration}d
                </span>
              </>
            ) : (
              <div
                className={`absolute flex items-center overflow-hidden rounded ${
                  critical ? 'bg-red-100 ring-1 ring-red-400' : t.id === selectedTaskId ? 'bg-sky-100 ring-1 ring-sky-400' : 'bg-sky-500/85'
                }`}
                style={{ left: r.left, top: (ROW_H - BAR_H) / 2, width: r.width, height: BAR_H }}
                title={title}
              >
                {labelInside && (
                  <span className={`truncate px-1 text-[10px] font-medium ${critical ? 'text-red-800' : 'text-white'}`}>{name}</span>
                )}
                {!labelInside && (
                  <span className="absolute left-full ml-1 whitespace-nowrap text-[11px] text-gray-700">{name}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
