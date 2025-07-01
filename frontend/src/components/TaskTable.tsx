import React, { useState, useCallback, useMemo } from 'react'
import { Task } from '../hooks/useTasks'
import { TaskRelation } from '../services/scheduleApi'
import { DatePickerCell } from './DatePickerCell'
import { ChevronRight, Plus, Trash2, Edit2, Copy, Scissors } from 'lucide-react'

interface TaskTableProps {
  tasks: Task[]
  allTasks: Task[]
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddTask: (task: Partial<Task>) => Promise<void>
  selectedTaskId?: string
  onSelectTask: (taskId: string | null) => void
  onCircularError?: (error: string) => void
  view: 'schedule' | 'details'
}

interface EditingState {
  taskId: string | null
  field: string | null
  value: any
}

interface NewRowState {
  isAdding: boolean
  afterTaskId?: string
  wbsPath: string
  name: string
  duration: number
  startDate: string
  budget: number
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  taskId: string | null
}

interface LagInputProps {
  value: number
  onChange: (value: number) => void
}

const LagInput: React.FC<LagInputProps> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value.toString())

  const handleSave = () => {
    const numValue = parseInt(inputValue) || 0
    onChange(numValue)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setInputValue(value.toString())
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full px-1 py-0.5 text-xs border rounded"
        autoFocus
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
    >
      {value}d
    </span>
  )
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  allTasks,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  selectedTaskId,
  onSelectTask,
  onCircularError,
  view
}) => {
  const [editingState, setEditingState] = useState<EditingState>({
    taskId: null,
    field: null,
    value: null
  })

  const [newRowState, setNewRowState] = useState<NewRowState>({
    isAdding: false,
    wbsPath: '',
    name: '',
    duration: 1,
    startDate: new Date().toISOString().split('T')[0],
    budget: 0
  })

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    taskId: null
  })

  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())

  // Common styling classes
  const cell = "text-center align-middle py-1 px-2"
  const head = "sticky top-0 z-10 bg-white text-center text-xs font-semibold text-gray-500"

  // Depth calculation for visual nesting
  const depth = (code: string): number => code.split('.').length - 1

  // Enhanced WBS helper functions
  const getWbsLevel = (wbsPath: string): number => {
    if (!wbsPath) return 1
    // For level 0 (root project), wbsPath is "0"
    if (wbsPath === '0') return 0
    // Count meaningful levels, excluding trailing zeros
    const parts = wbsPath.split('.').filter(part => part !== '0' && part !== '')
    return Math.max(1, parts.length)
  }

  const formatWbsCode = (wbsPath: string): string => {
    if (!wbsPath) return '1.0'
    // For level 0 root project, just return "0"
    if (wbsPath === '0') return '0'
    
    // For other levels, keep the actual structure without adding trailing zeros
    const parts = wbsPath.split('.')
    return parts.join('.')
  }

  const getIndentationLevel = (wbsPath: string): number => {
    return Math.max(0, getWbsLevel(wbsPath))
  }

  const getRowBackgroundColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
      'bg-slate-50',        // Level 0: Light slate - Project root
      'bg-blue-50',         // Level 1: Light blue - Project phases
      'bg-green-50',        // Level 2: Light green - Major work packages
      'bg-purple-50',       // Level 3: Light purple - Work packages
      'bg-orange-50',       // Level 4: Light orange - Activities
      'bg-pink-50',         // Level 5: Light pink - Sub-activities
      'bg-indigo-50',       // Level 6: Light indigo - Tasks
      'bg-teal-50',         // Level 7: Light teal - Sub-tasks
      'bg-red-50',          // Level 8: Light red - Details
      'bg-amber-50',        // Level 9: Light amber - Sub-details
      'bg-gray-50'          // Level 10: Light gray - Maximum depth
    ]
    return colors[Math.min(level, colors.length - 1)] || 'bg-white'
  }

  const getWbsTextColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
      'text-slate-900 font-black',      // Level 0: Very dark slate, black weight - Project root
      'text-blue-800 font-bold',        // Level 1: Dark blue, bold
      'text-green-800 font-bold',       // Level 2: Dark green, bold
      'text-purple-800 font-semibold',  // Level 3: Dark purple, semibold
      'text-orange-800 font-semibold',  // Level 4: Dark orange, semibold
      'text-pink-800 font-medium',      // Level 5: Dark pink, medium
      'text-indigo-800 font-medium',    // Level 6: Dark indigo, medium
      'text-teal-800',                  // Level 7: Dark teal, normal
      'text-red-800',                   // Level 8: Dark red, normal
      'text-amber-800',                 // Level 9: Dark amber, normal
      'text-gray-800'                   // Level 10: Dark gray, normal
    ]
    return colors[Math.min(level, colors.length - 1)] || 'text-gray-600'
  }

  const getTaskNameTextColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
      'text-slate-900 font-black',      // Level 0: Very dark slate, black weight - Project root
      'text-blue-900 font-bold',        // Level 1: Very dark blue, bold
      'text-green-900 font-bold',       // Level 2: Very dark green, bold
      'text-purple-800 font-semibold',  // Level 3: Dark purple, semibold
      'text-orange-800 font-semibold',  // Level 4: Dark orange, semibold
      'text-pink-800 font-medium',      // Level 5: Dark pink, medium
      'text-indigo-800 font-medium',    // Level 6: Dark indigo, medium
      'text-teal-700',                  // Level 7: Dark teal, normal
      'text-red-700',                   // Level 8: Dark red, normal
      'text-amber-700',                 // Level 9: Dark amber, normal
      'text-gray-700'                   // Level 10: Dark gray, normal
    ]
    return colors[Math.min(level, colors.length - 1)] || 'text-gray-700'
  }

  const getBorderColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
      'border-slate-300',    // Level 0
      'border-blue-200',     // Level 1
      'border-green-200',    // Level 2
      'border-purple-200',   // Level 3
      'border-orange-200',   // Level 4
      'border-pink-200',     // Level 5
      'border-indigo-200',   // Level 6
      'border-teal-200',     // Level 7
      'border-red-200',      // Level 8
      'border-amber-200',    // Level 9
      'border-gray-200'      // Level 10
    ]
    return colors[Math.min(level, colors.length - 1)] || 'border-gray-200'
  }

  // Calculate budget rollup for a task (includes children)
  const calculateBudgetRollup = (task: Task): number => {
    const childTasks = tasks.filter(t => t.parentId === task.id)
    if (childTasks.length === 0) {
      // Leaf task - return its direct budget
      return task.budget || 0
    } else {
      // Parent task - sum children budgets
      return childTasks.reduce((sum, child) => sum + calculateBudgetRollup(child), 0)
    }
  }

  // Helper function to generate next WBS code
  const generateNextWbsCode = (afterTaskId?: string) => {
    if (!afterTaskId) {
      // Adding at the end, find the highest root level
      const rootTasks = tasks.filter(t => getWbsLevel(t.wbsPath) === 1)
      const maxRoot = Math.max(0, ...rootTasks.map(t => parseInt(t.wbsPath.split('.')[0]) || 0))
      return `${maxRoot + 1}`
    }

    const afterTask = tasks.find(t => t.id === afterTaskId)
    if (!afterTask) return '1'

    const afterWbs = afterTask.wbsPath
    const parts = afterWbs.split('.')
    
    // If it's a root level task, increment the last number
    if (parts.length === 1) {
      return `${parseInt(parts[0]) + 1}`
    }
    
    // For child tasks, increment the last part
    const lastPart = parseInt(parts[parts.length - 1])
    parts[parts.length - 1] = `${lastPart + 1}`
    return parts.join('.')
  }

  const handleStartEdit = useCallback((taskId: string, field: string, value: any) => {
    setEditingState({ taskId, field, value })
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (editingState.taskId && editingState.field) {
      const updates: Partial<Task> = { [editingState.field]: editingState.value }
      
      // Handle special case for duration changes
      if (editingState.field === 'duration') {
        const task = tasks.find(t => t.id === editingState.taskId)
        if (task) {
          const endDate = new Date(task.startDate)
          endDate.setDate(endDate.getDate() + editingState.value - 1)
          updates.endDate = endDate.toISOString().split('T')[0]
        }
      }
      
      onUpdateTask(editingState.taskId, updates)
    }
    
    setEditingState({ taskId: null, field: null, value: null })
  }, [editingState, onUpdateTask, tasks])

  const handleCancelEdit = useCallback(() => {
    setEditingState({ taskId: null, field: null, value: null })
  }, [])

  const handleCellClick = (taskId: string, field: string, value: any) => {
    setEditingState({ taskId, field, value })
  }

  const handleAddRow = (afterTaskId?: string) => {
    const wbsPath = generateNextWbsCode(afterTaskId)
    setNewRowState({
      isAdding: true,
      afterTaskId,
      wbsPath,
      name: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      budget: 0
    })
  }

  const handleSaveNewRow = async () => {
    try {
      const newTask: Partial<Task> = {
        wbsPath: newRowState.wbsPath,
        name: newRowState.name || 'New Task',
        duration: newRowState.duration,
        startDate: newRowState.startDate,
        endDate: calculateEndDate(newRowState.startDate, newRowState.duration),
        budget: newRowState.budget,
        isMilestone: false,
        predecessors: []
      }

      await onAddTask(newTask)
      
      setNewRowState({
        isAdding: false,
        wbsPath: '',
        name: '',
        duration: 1,
        startDate: new Date().toISOString().split('T')[0],
        budget: 0
      })
    } catch (error) {
      console.error('Failed to add task:', error)
    }
  }

  const handleCancelNewRow = () => {
    setNewRowState({
      isAdding: false,
      wbsPath: '',
      name: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      budget: 0
    })
  }

  const formatCurrency = (value: number | string) => {
    // Handle potential string or Decimal values from database
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    
    // Handle invalid or very large numbers
    if (isNaN(numValue) || !isFinite(numValue)) return '$0'
    if (numValue === 0) return '$0'
    
    // Handle extremely large numbers that might cause scientific notation
    if (numValue > 1e15) {
      console.warn('Extremely large budget value detected:', numValue)
      return '$0' // Fallback for unrealistic values
    }
    
    if (numValue >= 1000000000) {
      return `$${(numValue / 1000000000).toFixed(1)}B`
    } else if (numValue >= 1000000) {
      return `$${(numValue / 1000000).toFixed(1)}M`
    } else if (numValue >= 1000) {
      return `$${(numValue / 1000).toFixed(0)}K`
    }
    return `$${Math.round(numValue).toLocaleString()}`
  }

  const calculateEndDate = (startDate: string, duration: number) => {
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + duration - 1)
    return endDate.toISOString().split('T')[0]
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    })
  }

  const isEditing = (taskId: string, field: string) => 
    editingState.taskId === taskId && editingState.field === field

  // Right-click context menu handlers
  const handleRightClick = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      taskId
    })
  }

  const hideContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, taskId: null })
  }

  const handleContextMenuAction = (action: string) => {
    if (contextMenu.taskId) {
      switch (action) {
        case 'add':
          handleAddRow(contextMenu.taskId)
          break
        case 'edit':
          const task = tasks.find(t => t.id === contextMenu.taskId)
          if (task) {
            setEditingState({ taskId: task.id, field: 'name', value: task.title || task.name })
          }
          break
        case 'copy':
          // TODO: Implement copy functionality
          console.log('Copy task:', contextMenu.taskId)
          break
        case 'cut':
          // TODO: Implement cut functionality
          console.log('Cut task:', contextMenu.taskId)
          break
        case 'delete':
          onDeleteTask(contextMenu.taskId)
          break
      }
    }
    hideContextMenu()
  }

  // Click outside handler for context menu
  React.useEffect(() => {
    const handleClickOutside = () => hideContextMenu()
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.visible])

  const renderNewRow = () => {
    if (!newRowState.isAdding) return null

    return (
      <tr className="bg-sky-50 border-l-4 border-sky-400">
        {/* WBS Path */}
        <td className={`${cell} rounded-l-md border border-r-0 border-gray-200`}>
          <input
            type="text"
            value={newRowState.wbsPath}
            onChange={(e) => setNewRowState(prev => ({ ...prev, wbsPath: e.target.value }))}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs font-mono"
            placeholder="WBS"
          />
        </td>

        {/* Task Name */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="text"
            value={newRowState.name}
            onChange={(e) => setNewRowState(prev => ({ ...prev, name: e.target.value }))}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="Task name"
            autoFocus
          />
        </td>

        {/* Duration */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="number"
            min="1"
            value={newRowState.duration}
            onChange={(e) => setNewRowState(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
          />
        </td>

        {/* Start Date */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="date"
            value={newRowState.startDate}
            onChange={(e) => setNewRowState(prev => ({ ...prev, startDate: e.target.value }))}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs"
          />
        </td>

        {/* End Date (calculated) */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <span className="text-gray-500 text-xs">
            {formatDate(calculateEndDate(newRowState.startDate, newRowState.duration))}
          </span>
        </td>

        {/* Budget */}
        <td className={`${cell} rounded-r-md border border-l-0 border-gray-200`}>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              step="1000"
              value={newRowState.budget}
              onChange={(e) => setNewRowState(prev => ({ ...prev, budget: parseFloat(e.target.value) || 0 }))}
              className="flex-1 rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs"
              placeholder="0"
            />
            <button
              onClick={handleSaveNewRow}
              className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
              title="Save"
            >
              ✓
            </button>
            <button
              onClick={handleCancelNewRow}
              className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
              title="Cancel"
            >
              ✕
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const renderAddButton = (afterTaskId?: string) => (
    <tr className="group">
      <td colSpan={6} className="py-1">
        <button
          onClick={() => handleAddRow(afterTaskId)}
          className="w-full py-1 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add task</span>
        </button>
      </td>
    </tr>
  )

  // Calculate if task is driven by predecessors
  const isDriven = (task: Task): boolean => {
    return (task.predecessors && task.predecessors.length > 0) || false
  }

  // Calculate finish date based on predecessors
  const calcFinish = (task: Task): Date => {
    if (!isDriven(task)) {
      return task.endDate
    }
    
    // Find the latest predecessor finish + lag
    let latestFinish = task.startDate
    if (task.predecessors) {
      for (const pred of task.predecessors) {
        const predTask = tasks.find(t => t.id === pred.predecessorId)
        if (predTask) {
          const predFinish = new Date(predTask.endDate)
          predFinish.setDate(predFinish.getDate() + (pred.lag || 0))
          if (predFinish > latestFinish) {
            latestFinish = predFinish
          }
        }
      }
    }
    
    // Add duration to start date
    const finishDate = new Date(latestFinish)
    finishDate.setDate(finishDate.getDate() + (task.duration || 1))
    return finishDate
  }

  // Toggle task collapse
  const toggleCollapse = (taskId: string) => {
    setCollapsedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  // Filter visible tasks based on collapse state
  const visibleTasks = useMemo(() => {
    const visible: Task[] = []
    
    const addTaskAndChildren = (task: Task, parentCollapsed = false) => {
      if (!parentCollapsed) {
        visible.push(task)
      }
      
      const children = tasks.filter(t => t.parentId === task.id)
      const isCollapsed = collapsedTasks.has(task.id)
      
      children.forEach(child => {
        addTaskAndChildren(child, parentCollapsed || isCollapsed)
      })
    }
    
    // Start with root tasks
    const rootTasks = tasks.filter(t => !t.parentId)
    rootTasks.forEach(task => addTaskAndChildren(task))
    
    return visible
  }, [tasks, collapsedTasks])

  return (
    <div className="relative overflow-auto w-full">
      <table className="min-w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className={head} style={{ textAlign: 'left', paddingLeft: '8px' }}>
              Task
            </th>
            {view === 'schedule' ? (
              <>
                <th className={head}>Type</th>
                <th className={head}>Duration</th>
                <th className={head}>Start</th>
                <th className={head}>Finish</th>
                <th className={head}>%</th>
              </>
            ) : (
              <>
                <th className={head}>Budget</th>
                <th className={head}>Role1</th>
                <th className={head}>Role2</th>
                <th className={head}>Predecessors</th>
                <th className={head}>Lag</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleTasks.map((task) => {
            const hasChildren = tasks.some(t => t.parentId === task.id)
            const isCollapsed = collapsedTasks.has(task.id)
            const taskDepth = depth(task.wbsPath || task.wbsCode || '')
            const driven = isDriven(task)

            return (
              <tr
                key={task.id}
                className={`hover:bg-gray-50 transition-colors ${
                  selectedTaskId === task.id ? 'bg-blue-50' : ''
                } ${taskDepth % 2 === 1 ? 'bg-gray-25' : ''}`}
                onContextMenu={(e) => handleRightClick(e, task.id)}
                onClick={() => onSelectTask?.(task.id)}
              >
                {/* First column: WBS + Name with breadcrumb indentation */}
                <td className="py-1 px-2 text-left">
                  <div
                    style={{ paddingLeft: `${taskDepth * 1.25}rem` }}
                    className="relative flex items-center gap-1"
                  >
                    {hasChildren && (
                      <ChevronRight
                        className={`h-4 w-4 cursor-pointer transition-transform ${
                          isCollapsed ? 'rotate-0' : 'rotate-90'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleCollapse(task.id)
                        }}
                      />
                    )}
                    <span className="text-xs text-gray-400 font-mono">
                      {task.wbsPath || task.wbsCode || ''}
                    </span>
                    <span className="truncate font-medium">
                      {editingState.taskId === task.id && editingState.field === 'name' ? (
                        <input
                          type="text"
                          value={editingState.value}
                          onChange={(e) =>
                            setEditingState(prev => ({ ...prev, value: e.target.value }))
                          }
                          onBlur={() => {
                            onUpdateTask(task.id, { title: editingState.value })
                            setEditingState({ taskId: null, field: null, value: null })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onUpdateTask(task.id, { title: editingState.value })
                              setEditingState({ taskId: null, field: null, value: null })
                            } else if (e.key === 'Escape') {
                              setEditingState({ taskId: null, field: null, value: null })
                            }
                          }}
                          className="w-full px-1 py-0.5 border rounded"
                          autoFocus
                        />
                      ) : (
                        task.title || task.name
                      )}
                    </span>
                  </div>
                </td>

                {view === 'schedule' ? (
                  <>
                    {/* Type */}
                    <td className={cell}>
                      {task.isMilestone ? 'Milestone' : 'Task'}
                    </td>
                    
                    {/* Duration */}
                    <td className={cell}>
                      {task.duration}d
                    </td>
                    
                    {/* Start Date */}
                    <td className={cell}>
                      <DatePickerCell
                        date={task.startDate}
                        onChange={(date) => onUpdateTask(task.id, { startDate: date })}
                      />
                    </td>
                    
                    {/* Finish Date */}
                    <td className={cell}>
                      {driven ? (
                        <span className="text-gray-600">
                          {formatDate(calcFinish(task))}
                        </span>
                      ) : (
                        <DatePickerCell
                          date={task.endDate}
                          onChange={(date) => onUpdateTask(task.id, { endDate: date })}
                        />
                      )}
                    </td>
                    
                    {/* Progress % */}
                    <td className={cell}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={task.progress || 0}
                        onChange={(e) =>
                          onUpdateTask(task.id, { progress: parseInt(e.target.value) || 0 })
                        }
                        className="w-16 px-1 py-0.5 text-xs border rounded text-center"
                      />
                      %
                    </td>
                  </>
                ) : (
                  <>
                    {/* Budget */}
                    <td className={cell}>
                      {formatCurrency(task.budget || 0)}
                    </td>
                    
                    {/* Role1 */}
                    <td className={cell}>
                      <input
                        type="text"
                        value={task.resourceRole || ''}
                        onChange={(e) =>
                          onUpdateTask(task.id, { resourceRole: e.target.value })
                        }
                        className="w-full px-1 py-0.5 text-xs border rounded"
                        placeholder="Role"
                      />
                    </td>
                    
                    {/* Role2 */}
                    <td className={cell}>
                      <input
                        type="text"
                        value={task.resourceRole2 || ''}
                        onChange={(e) =>
                          onUpdateTask(task.id, { resourceRole2: e.target.value })
                        }
                        className="w-full px-1 py-0.5 text-xs border rounded"
                        placeholder="Role 2"
                      />
                    </td>
                    
                    {/* Predecessors */}
                    <td className={cell}>
                      <span className="text-xs text-gray-600">
                        {task.predecessors?.map(p => p.predecessorId).join(', ') || '-'}
                      </span>
                    </td>
                    
                    {/* Lag */}
                    <td className={cell}>
                      <LagInput
                        value={task.lag || 0}
                        onChange={(lag) => onUpdateTask(task.id, { lag })}
                      />
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
        >
          <button
            onClick={() => handleContextMenuAction('add')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            Add Child
          </button>
          <button
            onClick={() => handleContextMenuAction('edit')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => handleContextMenuAction('copy')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            onClick={() => handleContextMenuAction('cut')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Scissors className="w-3 h-3" />
            Cut
          </button>
          <hr className="my-1" />
          <button
            onClick={() => handleContextMenuAction('delete')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
} 