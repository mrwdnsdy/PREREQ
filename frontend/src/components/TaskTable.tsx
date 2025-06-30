import React, { useState, useCallback } from 'react'
import { Task } from '../hooks/useTasks'
import { TaskRelation } from '../services/scheduleApi'
import { DatePickerCell } from './DatePickerCell'
import { Plus, Trash2, ChevronRight, Edit2, Copy, Scissors } from 'lucide-react'

interface TaskTableProps {
  tasks: Task[]
  allTasks: Task[]
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  onAddTask: (task: Partial<Task>) => Promise<void>
  selectedTaskId?: string
  onSelectTask: (taskId: string | null) => void
  onCircularError?: (error: string) => void
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

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  allTasks,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  selectedTaskId,
  onSelectTask,
  onCircularError
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

  // Common styling classes
  const cell = "text-center align-middle py-2 px-2"
  const head = "sticky top-0 z-10 bg-white text-center text-sm font-semibold text-gray-500 py-3"

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
            setEditingState({ taskId: task.id, field: 'name', value: task.name })
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

  return (
    <div className="relative overflow-hidden w-full h-full">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className={head} style={{ width: '10%', minWidth: '100px' }}>
              WBS Code
            </th>
            <th className={head} style={{ width: '35%', minWidth: '200px' }}>
              Task Name
            </th>
            <th className={head} style={{ width: '10%', minWidth: '80px' }}>
              Duration
            </th>
            <th className={head} style={{ width: '15%', minWidth: '120px' }}>
              Start Date
            </th>
            <th className={head} style={{ width: '15%', minWidth: '120px' }}>
              End Date
            </th>
            <th className={head} style={{ width: '15%', minWidth: '120px' }}>
              Budget
            </th>
          </tr>
        </thead>
        <tbody className="overflow-auto">
          {tasks.length === 0 && !newRowState.isAdding ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-500">
                <div className="flex flex-col items-center gap-2">
                  <span>No tasks yet. Click below to add your first task.</span>
                  <button
                    onClick={() => handleAddRow()}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Task
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {tasks.map((task, index) => {
                const level = getWbsLevel(task.wbsPath)
                const indentLevel = getIndentationLevel(task.wbsPath)
                const bgColor = getRowBackgroundColor(task.wbsPath)
                const wbsTextColor = getWbsTextColor(task.wbsPath)
                const taskNameTextColor = getTaskNameTextColor(task.wbsPath)
                const borderColor = getBorderColor(task.wbsPath)
                const formattedWbs = formatWbsCode(task.wbsPath)
                const budgetRollup = calculateBudgetRollup(task)
                
                return (
                  <React.Fragment key={task.id}>
                    <tr
                      className={`
                        group hover:bg-opacity-80 transition-colors duration-150 ${bgColor} border-l-4 ${borderColor}
                        ${selectedTaskId === task.id ? 'ring-2 ring-sky-500 ring-opacity-50' : ''}
                      `}
                      onClick={() => onSelectTask(task.id)}
                      onContextMenu={(e) => handleRightClick(e, task.id)}
                    >
                      {/* WBS Path */}
                      <td className={`${cell} rounded-l-md border border-r-0 border-gray-200`}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Level Badge */}
                          <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${
                            level === 0 ? 'bg-slate-700 text-white' :
                            level === 1 ? 'bg-blue-600 text-white' :
                            level === 2 ? 'bg-green-600 text-white' :
                            level === 3 ? 'bg-purple-600 text-white' :
                            level === 4 ? 'bg-yellow-600 text-white' :
                            level === 5 ? 'bg-pink-600 text-white' :
                            level === 6 ? 'bg-indigo-600 text-white' :
                            'bg-orange-600 text-white'
                          }`}>
                            {level}
                          </span>
                          
                          {isEditing(task.id, 'wbsPath') ? (
                            <input
                              type="text"
                              value={editingState.value}
                              onChange={(e) => handleStartEdit(task.id, 'wbsPath', e.target.value)}
                              onBlur={handleSaveEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              className="flex-1 rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs font-mono"
                              autoFocus
                            />
                          ) : (
                            <span 
                              className={`text-sm font-mono cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded ${wbsTextColor}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCellClick(task.id, 'wbsPath', task.wbsPath)
                              }}
                              title={`Level ${level} - Click to edit`}
                            >
                              {formattedWbs}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Task Name with Visual Hierarchy */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        <div className="flex items-center" style={{ paddingLeft: `${indentLevel * 20}px` }}>
                          {/* Indentation guides */}
                          {Array.from({ length: indentLevel }, (_, i) => (
                            <div key={i} className="w-4 h-4 flex items-center justify-center">
                              <div className="w-px h-full bg-gray-300"></div>
                            </div>
                          ))}
                          
                          {/* Level indicator */}
                          {level > 0 && (
                            <ChevronRight className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                          )}
                          
                          {isEditing(task.id, 'name') ? (
                            <input
                              type="text"
                              value={editingState.value}
                              onChange={(e) => handleStartEdit(task.id, 'name', e.target.value)}
                              onBlur={handleSaveEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              className="flex-1 rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCellClick(task.id, 'name', task.name)
                              }}
                              className={`flex-1 cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-left text-sm ${getTaskNameTextColor(task.wbsPath)}`}
                            >
                              {task.name}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Duration */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        {isEditing(task.id, 'duration') ? (
                          <input
                            type="number"
                            min="1"
                            value={editingState.value}
                            onChange={(e) => handleStartEdit(task.id, 'duration', parseInt(e.target.value) || 1)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit()
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCellClick(task.id, 'duration', task.duration)
                            }}
                            className="cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-sm"
                          >
                            {task.duration}d
                          </div>
                        )}
                      </td>

                      {/* Start Date - Editable */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        {isEditing(task.id, 'startDate') ? (
                          <input
                            type="date"
                            value={editingState.value}
                            onChange={(e) => handleStartEdit(task.id, 'startDate', e.target.value)}
                            onBlur={() => {
                              // Also update end date when start date changes
                              const task = tasks.find(t => t.id === editingState.taskId)
                              if (task) {
                                const endDate = calculateEndDate(editingState.value, task.duration)
                                onUpdateTask(editingState.taskId!, { startDate: editingState.value, endDate })
                              }
                              handleSaveEdit()
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const task = tasks.find(t => t.id === editingState.taskId)
                                if (task) {
                                  const endDate = calculateEndDate(editingState.value, task.duration)
                                  onUpdateTask(editingState.taskId!, { startDate: editingState.value, endDate })
                                }
                                handleSaveEdit()
                              }
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCellClick(task.id, 'startDate', task.startDate)
                            }}
                            className="cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-sm"
                          >
                            {formatDate(task.startDate)}
                          </div>
                        )}
                      </td>

                      {/* End Date - Editable */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        {isEditing(task.id, 'endDate') ? (
                          <input
                            type="date"
                            value={editingState.value}
                            onChange={(e) => handleStartEdit(task.id, 'endDate', e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit()
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCellClick(task.id, 'endDate', task.endDate)
                            }}
                            className="cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-sm"
                          >
                            {formatDate(task.endDate)}
                          </div>
                        )}
                      </td>

                      {/* Budget with Rollup */}
                      <td className={`${cell} rounded-r-md border border-l-0 border-gray-200`}>
                        <div className="flex flex-col items-center">
                          {/* Show rollup total for parent tasks */}
                          {tasks.some(t => t.parentId === task.id) && (
                            <div className="text-sm font-bold text-green-700">
                              {formatCurrency(budgetRollup)}
                            </div>
                          )}
                          
                          {/* Direct budget (editable) */}
                          {isEditing(task.id, 'budget') ? (
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={editingState.value}
                              onChange={(e) => handleStartEdit(task.id, 'budget', parseFloat(e.target.value) || 0)}
                              onBlur={handleSaveEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit()
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                              className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
                              autoFocus
                            />
                          ) : (
                            <div
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCellClick(task.id, 'budget', task.budget)
                              }}
                              className={`cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-sm ${
                                tasks.some(t => t.parentId === task.id) ? 'text-gray-500' : 'text-gray-800'
                              }`}
                            >
                              {tasks.some(t => t.parentId === task.id) ? 
                                `(${formatCurrency(task.budget || 0)})` : 
                                formatCurrency(task.budget || 0)
                              }
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* New row insertion */}
                    {newRowState.isAdding && newRowState.afterTaskId === task.id && renderNewRow()}
                  </React.Fragment>
                )
              })}

              {/* New row at the end */}
              {newRowState.isAdding && !newRowState.afterTaskId && renderNewRow()}

              {/* Add button at the end */}
              {!newRowState.isAdding && renderAddButton()}
            </>
          )}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[150px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleContextMenuAction('add')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
          <button
            onClick={() => handleContextMenuAction('edit')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => handleContextMenuAction('copy')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={() => handleContextMenuAction('cut')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Scissors className="w-4 h-4" />
            Cut
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => handleContextMenuAction('delete')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
} 