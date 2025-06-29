import React, { useState, useCallback } from 'react'
import { Task } from '../hooks/useTasks'
import { TaskRelation } from '../services/scheduleApi'
import { DatePickerCell } from './DatePickerCell'
import { RelationshipSelector } from './RelationshipSelector'
import { Plus, Trash2, ChevronRight } from 'lucide-react'

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

  // Common styling classes
  const cell = "text-center align-middle py-1 px-1"
  const head = "sticky top-0 z-10 bg-white text-center text-xs font-semibold text-gray-500"

  // Enhanced WBS helper functions
  const getWbsLevel = (wbsPath: string): number => {
    if (!wbsPath) return 1
    // Remove trailing zeros and count meaningful levels
    const parts = wbsPath.split('.').filter(part => part !== '0' && part !== '')
    return Math.max(1, parts.length)
  }

  const formatWbsCode = (wbsPath: string): string => {
    if (!wbsPath) return '1.0'
    const parts = wbsPath.split('.')
    // Ensure each part has at least one digit, pad with .0 if needed
    const formattedParts = parts.map(part => {
      const num = parseInt(part) || 1
      return num.toString()
    })
    
    // Add trailing zeros to match P6 style (e.g., 1.1 becomes 1.1.0.0.0)
    while (formattedParts.length < 5) {
      formattedParts.push('0')
    }
    
    return formattedParts.join('.')
  }

  const getIndentationLevel = (wbsPath: string): number => {
    return Math.max(0, getWbsLevel(wbsPath) - 1)
  }

  const getRowBackgroundColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
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
    return colors[Math.min(level - 1, colors.length - 1)] || 'bg-white'
  }

  const getWbsTextColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
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
    return colors[Math.min(level - 1, colors.length - 1)] || 'text-gray-600'
  }

  const getTaskNameTextColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
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
    return colors[Math.min(level - 1, colors.length - 1)] || 'text-gray-700'
  }

  const getBorderColor = (wbsPath: string): string => {
    const level = getWbsLevel(wbsPath)
    const colors = [
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
    return colors[Math.min(level - 1, colors.length - 1)] || 'border-gray-200'
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

      // Handle WBS path changes
      if (editingState.field === 'wbsPath') {
        updates.wbsPath = editingState.value
      }
      
      onUpdateTask(editingState.taskId, updates)
    }
    setEditingState({ taskId: null, field: null, value: null })
  }, [editingState, tasks, onUpdateTask])

  const handleCancelEdit = useCallback(() => {
    setEditingState({ taskId: null, field: null, value: null })
  }, [])

  const handleCellClick = (taskId: string, field: string, value: any) => {
    onSelectTask(taskId)
    handleStartEdit(taskId, field, value)
  }

  const handleAddRow = (afterTaskId?: string) => {
    const nextWbs = generateNextWbsCode(afterTaskId)
    setNewRowState({
      isAdding: true,
      afterTaskId,
      wbsPath: nextWbs,
      name: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      budget: 0
    })
  }

  const handleSaveNewRow = async () => {
    if (!newRowState.name.trim()) return

    const endDate = new Date(newRowState.startDate)
    endDate.setDate(endDate.getDate() + newRowState.duration - 1)

    const newTask: Partial<Task> = {
      wbsPath: newRowState.wbsPath,
      name: newRowState.name,
      duration: newRowState.duration,
      startDate: newRowState.startDate,
      endDate: endDate.toISOString().split('T')[0],
      budget: newRowState.budget,
      percentComplete: 0,
      predecessors: []
    }

    try {
      await onAddTask(newTask)
      // Reset form only on success
      setNewRowState({
        isAdding: false,
        wbsPath: '',
        name: '',
        duration: 1,
        startDate: new Date().toISOString().split('T')[0],
        budget: 0
      })
    } catch (error: any) {
      // Show error message
      onCircularError?.(error.message || 'Failed to create task')
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const calculateEndDate = (startDate: string, duration: number) => {
    const start = new Date(startDate)
    const end = new Date(start)
    end.setDate(end.getDate() + duration - 1)
    return end.toISOString().split('T')[0]
  }

  const isEditing = (taskId: string, field: string) => 
    editingState.taskId === taskId && editingState.field === field

  const renderNewRow = () => {
    const level = getWbsLevel(newRowState.wbsPath)
    const indentLevel = getIndentationLevel(newRowState.wbsPath)
    const bgColor = getRowBackgroundColor(newRowState.wbsPath)
    const borderColor = getBorderColor(newRowState.wbsPath)

    return (
      <tr className={`${bgColor} border-2 border-sky-300 border-l-4 ${borderColor}`}>
        {/* WBS Path */}
        <td className={`${cell} rounded-l-md border border-r-0 border-gray-200`}>
          <div className="flex items-center justify-center gap-1">
            {/* Level Badge */}
            <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${
              level === 1 ? 'bg-slate-600 text-white' :
              level === 2 ? 'bg-blue-600 text-white' :
              level === 3 ? 'bg-green-600 text-white' :
              level === 4 ? 'bg-yellow-600 text-white' :
              level === 5 ? 'bg-purple-600 text-white' :
              level === 6 ? 'bg-pink-600 text-white' :
              level === 7 ? 'bg-indigo-600 text-white' :
              'bg-orange-600 text-white'
            }`}>
              {level}
            </span>
            
            <input
              type="text"
              value={newRowState.wbsPath}
              onChange={(e) => setNewRowState({ ...newRowState, wbsPath: e.target.value })}
              className="flex-1 rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center text-xs font-mono"
              placeholder="1.1"
            />
          </div>
        </td>

        {/* Task Name with Indentation */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <div className="flex items-center" style={{ paddingLeft: `${indentLevel * 20}px` }}>
            {/* Indentation guides */}
            {Array.from({ length: indentLevel }, (_, i) => (
              <div key={i} className="w-4 h-4 flex items-center justify-center">
                <div className="w-px h-full bg-gray-300"></div>
              </div>
            ))}
            
            {/* Level indicator */}
            {level > 1 && (
              <ChevronRight className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
            )}
            
            <input
              type="text"
              value={newRowState.name}
              onChange={(e) => setNewRowState({ ...newRowState, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNewRow()
                if (e.key === 'Escape') handleCancelNewRow()
              }}
              className="flex-1 rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Task name"
              autoFocus
            />
          </div>
        </td>

        {/* Duration */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="number"
            min="1"
            value={newRowState.duration}
            onChange={(e) => setNewRowState({ ...newRowState, duration: parseInt(e.target.value) || 1 })}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
          />
        </td>

        {/* Start Date */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="date"
            value={newRowState.startDate}
            onChange={(e) => setNewRowState({ ...newRowState, startDate: e.target.value })}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
          />
        </td>

        {/* End Date (calculated) */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <span className="text-gray-500 text-sm">
            {calculateEndDate(newRowState.startDate, newRowState.duration)}
          </span>
        </td>

        {/* Predecessors */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <span className="text-gray-400 text-sm">None</span>
        </td>

        {/* Budget */}
        <td className={`${cell} border border-x-0 border-gray-200`}>
          <input
            type="number"
            min="0"
            step="100"
            value={newRowState.budget}
            onChange={(e) => setNewRowState({ ...newRowState, budget: parseFloat(e.target.value) || 0 })}
            className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
          />
        </td>

        {/* Actions */}
        <td className={`${cell} rounded-r-md border border-l-0 border-gray-200`}>
          <div className="flex items-center justify-center gap-1">
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
              ✗
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const renderAddButton = (afterTaskId?: string) => (
    <tr className="group">
      <td colSpan={8} className="py-1">
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
    <div className="relative overflow-auto">
      <table className="w-full border-separate border-spacing-y-1 text-xs">
        <thead>
          <tr>
            <th className={head} style={{ width: '100px' }}>
              WBS Code
            </th>
            <th className={head} style={{ minWidth: '150px' }}>
              Task Name
            </th>
            <th className={head} style={{ width: '60px' }}>
              Duration
            </th>
            <th className={head} style={{ width: '220px' }}>
              Start Date
            </th>
            <th className={head} style={{ width: '220px' }}>
              End Date
            </th>
            <th className={head} style={{ width: '280px' }}>
              Predecessors
            </th>
            <th className={head} style={{ width: '80px' }}>
              Budget
            </th>
            <th className={head} style={{ width: '70px' }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && !newRowState.isAdding ? (
            <tr>
              <td colSpan={8} className="py-8 text-center text-gray-500">
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
                
                return (
                  <React.Fragment key={task.id}>
                    <tr
                      className={`
                        group hover:bg-opacity-80 transition-colors duration-150 ${bgColor} border-l-4 ${borderColor}
                        ${selectedTaskId === task.id ? 'ring-2 ring-sky-500 ring-opacity-50' : ''}
                      `}
                      onClick={() => onSelectTask(task.id)}
                    >
                      {/* WBS Path */}
                      <td className={`${cell} rounded-l-md border border-r-0 border-gray-200`}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Level Badge */}
                          <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${
                            level === 1 ? 'bg-slate-600 text-white' :
                            level === 2 ? 'bg-blue-600 text-white' :
                            level === 3 ? 'bg-green-600 text-white' :
                            level === 4 ? 'bg-yellow-600 text-white' :
                            level === 5 ? 'bg-purple-600 text-white' :
                            level === 6 ? 'bg-pink-600 text-white' :
                            level === 7 ? 'bg-indigo-600 text-white' :
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
                              className={`text-xs font-mono cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded ${wbsTextColor}`}
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
                          {level > 1 && (
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
                              className={`flex-1 cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-left text-xs ${getTaskNameTextColor(task.wbsPath)}`}
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
                            className="cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-xs"
                          >
                            {task.duration}d
                          </div>
                        )}
                      </td>

                      {/* Start Date */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        <DatePickerCell
                          value={task.startDate}
                          onChange={(date) => {
                            const endDate = calculateEndDate(date, task.duration)
                            onUpdateTask(task.id, { startDate: date, endDate })
                          }}
                          className="w-full text-center"
                        />
                      </td>

                      {/* End Date (read-only) */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        <span className="text-gray-500 text-xs">
                          {new Date(task.endDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </td>

                      {/* Predecessors */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        <div className="flex justify-center">
                          <RelationshipSelector
                            value={task.predecessors}
                            onChange={(relations) => onUpdateTask(task.id, { predecessors: relations })}
                            availableTasks={allTasks}
                            currentTaskId={task.id}
                            onCircularError={onCircularError}
                          />
                        </div>
                      </td>

                      {/* Budget */}
                      <td className={`${cell} border border-x-0 border-gray-200`}>
                        {isEditing(task.id, 'budget') ? (
                          <input
                            type="number"
                            min="0"
                            step="100"
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
                            className="cursor-pointer hover:bg-gray-100 hover:bg-opacity-50 px-1 py-0.5 rounded transition-colors duration-150 text-xs"
                          >
                            {formatCurrency(task.budget)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className={`${cell} rounded-r-md border border-l-0 border-gray-200`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddRow(task.id)
                            }}
                            className="p-1 text-sky-600 hover:bg-sky-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Add task after this one"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteTask(task.id)
                            }}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete task"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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
    </div>
  )
} 