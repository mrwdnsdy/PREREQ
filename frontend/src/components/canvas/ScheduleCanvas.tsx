import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Flag, FolderPlus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Task } from '../../hooks/useTasks'
import { useDependencies } from '../../hooks/useDependencies'
import { DependencyType, TaskDependency } from '../../services/dependenciesApi'
import { buildFlow, SavedPositions, EDGE_COLORS } from './flowTransform'
import { nodeTypes } from './nodes'

export interface ScheduleCanvasProps {
  tasks: Task[]
  projectId: string
  selectedTaskId: string | null
  onSelectTask: (id: string | null) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddTask: (task: Partial<Task>) => Promise<void> | void
}

const posKey = (projectId: string) => `prereq:canvas-pos:${projectId}`

function loadPositions(projectId: string): SavedPositions {
  try {
    return JSON.parse(localStorage.getItem(posKey(projectId)) || '{}')
  } catch {
    return {}
  }
}

function CanvasInner({
  tasks,
  projectId,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
}: ScheduleCanvasProps) {
  const queryClient = useQueryClient()
  const rf = useReactFlow()
  const { allDependencies, createDependency, updateDependency, deleteDependency } =
    useDependencies(projectId)
  const [positions, setPositions] = useState<SavedPositions>(() => loadPositions(projectId))
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)

  const deps = useMemo(() => allDependencies || [], [allDependencies])

  const flow = useMemo(
    () => buildFlow(tasks, deps, positions, selectedTaskId),
    [tasks, deps, positions, selectedTaskId],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges)

  // Re-sync the canvas whenever the underlying data (tasks/deps/selection) changes.
  useEffect(() => {
    setNodes(flow.nodes)
    setEdges(flow.edges)
  }, [flow, setNodes, setEdges])

  // Keep the table's predecessor/successor columns live: tasks embed dependencies,
  // and the dependencies hook does not invalidate the tasks query, so do it here
  // whenever the dependency set changes.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
  }, [deps.length, projectId, queryClient])

  const persistPosition = useCallback(
    (id: string, x: number, y: number) => {
      setPositions((prev) => {
        const next = { ...prev, [id]: { x, y } }
        try {
          localStorage.setItem(posKey(projectId), JSON.stringify(next))
        } catch {
          /* ignore quota errors */
        }
        return next
      })
    },
    [projectId],
  )

  // Draw a dependency: default Finish-to-Start, no lag.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return
      createDependency({
        predecessorId: c.source,
        successorId: c.target,
        type: DependencyType.FS,
        lag: 0,
      })
    },
    [createDependency],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedEdge(null)
      onSelectTask(node.id)
    },
    [onSelectTask],
  )

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedEdge(null)
    onSelectTask(null)
  }, [onSelectTask])

  // Persist a manual drag, and re-parent into a WBS group when dropped inside one.
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      persistPosition(node.id, node.position.x, node.position.y)
      if (node.type === 'wbsGroup') return
      const overGroup = rf
        .getIntersectingNodes(node)
        .filter((n) => n.type === 'wbsGroup' && n.id !== node.id)
        .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))
        .pop()
      const newParent = overGroup ? overGroup.id : null
      if ((node.parentNode || null) !== newParent && newParent) {
        onUpdateTask(node.id, { parentId: newParent })
      }
    },
    [persistPosition, rf, onUpdateTask],
  )

  const onNodesDelete = useCallback(
    (deleted: Node[]) => deleted.forEach((n) => onDeleteTask(n.id)),
    [onDeleteTask],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => deleted.forEach((e) => deleteDependency(e.id)),
    [deleteDependency],
  )

  // Where new nodes land: inside the selected group (or the selected node's group).
  const targetGroupId = useMemo(() => {
    const sel = tasks.find((t) => t.id === selectedTaskId)
    if (!sel) return null
    const selIsGroup = tasks.some((t) => t.parentId === sel.id)
    return selIsGroup ? sel.id : sel.parentId ?? null
  }, [tasks, selectedTaskId])

  const addPhase = () =>
    onAddTask({ title: 'New Phase', isHeader: true, parentId: targetGroupId || undefined })
  const addActivity = () => {
    if (!targetGroupId) {
      toast('Select a WBS group first, or add a phase.', { icon: 'ℹ️' })
      return
    }
    onAddTask({ title: 'New Activity', parentId: targetGroupId })
  }
  const addMilestone = () => {
    if (!targetGroupId) {
      toast('Select a WBS group first, or add a phase.', { icon: 'ℹ️' })
      return
    }
    onAddTask({ title: 'New Milestone', isMilestone: true, parentId: targetGroupId })
  }

  const dep = selectedEdge?.data?.dependency as TaskDependency | undefined

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      onNodeDragStop={onNodeDragStop}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      nodeTypes={nodeTypes}
      connectionLineType={ConnectionLineType.SmoothStep}
      defaultEdgeOptions={{ type: 'smoothstep' }}
      minZoom={0.15}
      fitView
      proOptions={{ hideAttribution: true }}
      className="bg-gray-50"
    >
      <Background gap={20} color="#e5e7eb" />
      <Controls />
      <MiniMap
        zoomable
        pannable
        nodeColor={(n) =>
          n.type === 'wbsGroup' ? '#e2e8f0' : n.type === 'milestone' ? '#f59e0b' : '#0284c7'
        }
      />

      {/* Toolbar */}
      <Panel position="top-left" className="flex gap-2">
        <button
          onClick={addPhase}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <FolderPlus className="h-4 w-4" /> Phase
        </button>
        <button
          onClick={addActivity}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Activity
        </button>
        <button
          onClick={addMilestone}
          className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 shadow-sm hover:bg-amber-100"
        >
          <Flag className="h-4 w-4" /> Milestone
        </button>
      </Panel>

      {/* Edge inspector */}
      {selectedEdge && dep && (
        <Panel position="top-right" className="w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">Dependency</span>
            <button onClick={() => setSelectedEdge(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 truncate text-[11px] text-gray-500">
            {dep.predecessor?.title} → {dep.successor?.title}
          </div>
          <label className="mt-2 block text-[11px] font-medium text-gray-500">Type</label>
          <select
            value={dep.type}
            onChange={(e) => updateDependency(dep.id, { type: e.target.value as DependencyType })}
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {Object.values(DependencyType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="mt-2 block text-[11px] font-medium text-gray-500">Lag (days)</label>
          <input
            type="number"
            defaultValue={dep.lag}
            onBlur={(e) => {
              const lag = parseInt(e.target.value, 10)
              if (!Number.isNaN(lag) && lag !== dep.lag) updateDependency(dep.id, { lag })
            }}
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              deleteDependency(dep.id)
              setSelectedEdge(null)
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" /> Remove link
          </button>
        </Panel>
      )}

      {/* Legend */}
      <Panel position="bottom-center" className="flex gap-3 rounded-md border border-gray-200 bg-white/90 px-3 py-1 text-[11px]">
        {Object.entries(EDGE_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded" style={{ background: c }} />
            {k}
          </span>
        ))}
      </Panel>

      {tasks.length === 0 && (
        <Panel position="top-center" className="rounded-md bg-white/90 px-4 py-2 text-sm text-gray-500 shadow">
          No tasks yet — add a Phase to start building the schedule.
        </Panel>
      )}
    </ReactFlow>
  )
}

export function ScheduleCanvas(props: ScheduleCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}

export default ScheduleCanvas
