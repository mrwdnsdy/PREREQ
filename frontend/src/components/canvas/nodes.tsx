import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Flag, Calendar } from 'lucide-react'
import { Task } from '../../hooks/useTasks'
import { formatDate } from '../../utils/dateFormat'

interface NodeData {
  task: Task
  label?: string
}

const handleStyle = { width: 9, height: 9, background: '#0284c7', border: '2px solid #fff' }

// Leaf node: an activity (work package). Source/target handles let users draw links.
export const ActivityNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  return (
    <div
      className={`rounded-md border bg-white shadow-sm px-3 py-2 w-[200px] transition-colors ${
        selected ? 'border-sky-500 ring-2 ring-sky-300' : 'border-gray-300'
      }`}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-gray-400">{t.activityId || t.wbsCode}</span>
        <span className="text-[11px] font-medium text-gray-500">{t.duration}d</span>
      </div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
        {t.name}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
        <Calendar className="h-3 w-3" />
        <span>
          {formatDate(t.startDate)} → {formatDate(t.endDate)}
        </span>
      </div>
      {typeof t.progress === 'number' && t.progress > 0 && (
        <div className="mt-1 h-1 w-full rounded bg-gray-100">
          <div className="h-1 rounded bg-sky-500" style={{ width: `${Math.min(100, t.progress)}%` }} />
        </div>
      )}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
ActivityNode.displayName = 'ActivityNode'

// Leaf node: a milestone (zero-duration gate), rendered as a diamond badge.
export const MilestoneNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  return (
    <div className="w-[200px]">
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div
        className={`flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-2 shadow-sm transition-colors ${
          selected ? 'border-amber-500 ring-2 ring-amber-300' : 'border-amber-300'
        }`}
      >
        <span className="inline-flex h-6 w-6 flex-shrink-0 rotate-45 items-center justify-center rounded-sm bg-amber-400" />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Flag className="h-3 w-3" /> Milestone
          </div>
          <div className="truncate text-sm font-semibold text-gray-900">{t.name}</div>
          <div className="text-[11px] text-gray-500">{formatDate(t.endDate)}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  )
})
MilestoneNode.displayName = 'MilestoneNode'

// Container node: a WBS group (header). Children render inside it.
export const WbsGroupNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  return (
    <div
      className={`h-full w-full rounded-lg border-2 border-dashed transition-colors ${
        selected ? 'border-sky-500 bg-sky-50/40' : 'border-gray-300 bg-gray-50/60'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-white">
          {t.wbsCode || 'WBS'}
        </span>
        <span className="truncate text-sm font-bold text-gray-800">{t.name}</span>
      </div>
    </div>
  )
})
WbsGroupNode.displayName = 'WbsGroupNode'

export const nodeTypes = {
  activity: ActivityNode,
  milestone: MilestoneNode,
  wbsGroup: WbsGroupNode,
}
