import { memo, useEffect, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Flag, Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import { Task } from '../../hooks/useTasks'
import { formatDate } from '../../utils/dateFormat'
import { useCanvasActions } from './canvasContext'
import { wbsGroupTheme } from '../../utils/wbsColors'
import type { CpmNode } from './cpm'

interface NodeData {
  task: Task
  label?: string
  collapsed?: boolean
  childCount?: number
  cpm?: CpmNode
  showCritical?: boolean
}

// Slack/critical chip shown when critical-path mode is on.
function CpmChip({ data }: { data: NodeData }) {
  if (!data.showCritical || !data.cpm) return null
  if (data.cpm.critical) {
    return (
      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
        critical
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
      {data.cpm.float}d float
    </span>
  )
}

// Connect points: a thin sky strip down/across each of the four sides, so a
// link can be started or finished anywhere around a box's edges (not just two
// fixed points). Faint until the node is hovered. All four are `type="source"`;
// ConnectionMode.Loose on the canvas lets any of them act as source OR target.
const HANDLE_CLS =
  'opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100'
const vStrip = { width: 7, height: '62%', background: '#0284c7', border: '1px solid #fff', borderRadius: 4, zIndex: 10 }
const hStrip = { height: 7, width: '62%', background: '#0284c7', border: '1px solid #fff', borderRadius: 4, zIndex: 10 }

function SideHandles() {
  return (
    <>
      <Handle id="left" type="source" position={Position.Left} className={HANDLE_CLS} style={vStrip} />
      <Handle id="right" type="source" position={Position.Right} className={HANDLE_CLS} style={vStrip} />
      <Handle id="top" type="source" position={Position.Top} className={HANDLE_CLS} style={hStrip} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={HANDLE_CLS} style={hStrip} />
    </>
  )
}

// Double-click to rename in place; Enter/blur commits, Escape cancels.
function EditableTitle({
  id,
  value,
  className,
}: {
  id: string
  value: string
  className?: string
}) {
  const { rename } = useCanvasActions()
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  useEffect(() => setVal(value), [value])

  if (editing) {
    return (
      <input
        autoFocus
        value={val}
        className={`nodrag rounded border border-sky-400 px-1 py-0.5 text-sm outline-none ${className || ''}`}
        onChange={(e) => setVal(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          setEditing(false)
          if (val.trim() && val.trim() !== value) rename(id, val.trim())
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setVal(value)
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <div
      className={className}
      title="Double-click to rename"
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {value}
    </div>
  )
}

// Leaf node: an activity (work package). Source/target handles let users draw links.
export const ActivityNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  const critical = !!data.showCritical && !!data.cpm?.critical
  return (
    <div
      className={`group rounded-md border bg-white shadow-sm px-3 py-2 w-[200px] transition-colors ${
        selected
          ? 'border-sky-500 ring-2 ring-sky-300'
          : critical
            ? 'border-red-500 ring-1 ring-red-200'
            : 'border-gray-300'
      }`}
    >
      <SideHandles />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-gray-400">{t.activityId || t.wbsCode}</span>
        <div className="flex items-center gap-1">
          <CpmChip data={data} />
          <span className="text-[11px] font-medium text-gray-500">{t.duration}d</span>
        </div>
      </div>
      <EditableTitle
        id={t.id}
        value={t.name}
        className="mt-0.5 text-sm font-semibold text-gray-900 leading-snug line-clamp-2"
      />
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
    </div>
  )
})
ActivityNode.displayName = 'ActivityNode'

// Leaf node: a milestone (zero-duration gate), rendered as a diamond badge.
export const MilestoneNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  const critical = !!data.showCritical && !!data.cpm?.critical
  return (
    <div className="group w-[200px]">
      <SideHandles />
      <div
        className={`flex items-center gap-2 rounded-md border bg-amber-50 px-3 py-2 shadow-sm transition-colors ${
          selected
            ? 'border-amber-500 ring-2 ring-amber-300'
            : critical
              ? 'border-red-500 ring-1 ring-red-200'
              : 'border-amber-300'
        }`}
      >
        <span
          className={`inline-flex h-6 w-6 flex-shrink-0 rotate-45 items-center justify-center rounded-sm ${
            critical ? 'bg-red-500' : 'bg-amber-400'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
            <Flag className="h-3 w-3" /> Milestone
            <CpmChip data={data} />
          </div>
          <EditableTitle id={t.id} value={t.name} className="truncate text-sm font-semibold text-gray-900" />
          <div className="text-[11px] text-gray-500">{formatDate(t.endDate)}</div>
        </div>
      </div>
    </div>
  )
})
MilestoneNode.displayName = 'MilestoneNode'

// Container node: a WBS group (header). Collapsible; children render inside it.
export const WbsGroupNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const t = data.task
  const { toggleCollapse } = useCanvasActions()
  const collapsed = !!data.collapsed
  // Per-level color scheme shared with the table view.
  const theme = wbsGroupTheme(t.wbsCode || t.wbsPath || '')

  const chevron = (
    <button
      className="nodrag rounded p-0.5 text-gray-500 hover:bg-gray-200"
      title={collapsed ? 'Expand' : 'Collapse'}
      onClick={(e) => {
        e.stopPropagation()
        toggleCollapse(t.id)
      }}
    >
      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  )
  const badge = (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold ${theme.badge}`}>
      {t.wbsCode || 'WBS'}
    </span>
  )

  if (collapsed) {
    return (
      <div
        className={`group flex h-full w-full items-center gap-2 rounded-md border bg-white px-2 shadow-sm transition-colors ${theme.accent} ${
          selected ? 'border-sky-500 ring-2 ring-sky-300' : 'border-gray-300'
        }`}
        title={`${formatDate(t.startDate)} → ${formatDate(t.endDate)}`}
      >
        <SideHandles />
        {chevron}
        {badge}
        <EditableTitle id={t.id} value={t.name} className="truncate text-sm font-bold text-gray-800" />
        <span className="ml-auto whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
          {data.childCount} activit{data.childCount === 1 ? 'y' : 'ies'} · {t.duration}d
        </span>
      </div>
    )
  }

  return (
    <div
      className={`group h-full w-full rounded-lg border-2 transition-colors ${theme.accent} ${
        selected ? 'border-sky-500 bg-sky-50/40' : theme.box
      }`}
    >
      <SideHandles />
      <div className="flex items-center gap-2 px-2 py-1.5">
        {chevron}
        {badge}
        <EditableTitle id={t.id} value={t.name} className="truncate text-sm font-bold text-gray-800" />
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
