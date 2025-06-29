import React, { useState, useCallback } from 'react'
import { Task, TaskRelation } from '../services/scheduleApi'
import { DatePickerCell } from './DatePickerCell'
import { RelationshipSelector } from './RelationshipSelector'

interface TaskTableProps {
  tasks: Task[]
  allTasks: Task[]
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  selectedTaskId?: string
  onSelectTask: (taskId: string | null) => void
  onCircularError?: (error: string) => void
}

interface EditingState {
  taskId: string | null
  field: string | null
  value: any
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  allTasks,
  onUpdateTask,
  onDeleteTask,
  selectedTaskId,
  onSelectTask,
  onCircularError
}) => {
  const [editingState, setEditingState] = useState<EditingState>({
    taskId: null,
    field: null,
    value: null
  })

  // Common styling classes
  const cell = "text-center align-middle py-1 px-2"
  const head = "sticky top-0 z-10 bg-white text-center text-xs font-semibold text-gray-500"

  // Helper function to calculate WBS depth
  const depth = (code: string) => code.split(".").length - 1

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
  }, [editingState, tasks, onUpdateTask])

  const handleCancelEdit = useCallback(() => {
    setEditingState({ taskId: null, field: null, value: null })
  }, [])

  const handleCellClick = (taskId: string, field: string, value: any) => {
    onSelectTask(taskId)
    handleStartEdit(taskId, field, value)
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

  return (
    <div className="relative overflow-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th className={head} style={{ width: '100px' }}>
              WBS
            </th>
            <th className={head} style={{ minWidth: '160px' }}>
              Task Name
            </th>
            <th className={head} style={{ width: '80px' }}>
              Duration
            </th>
            <th className={head} style={{ width: '135px' }}>
              Start Date
            </th>
            <th className={head} style={{ width: '135px' }}>
              End Date
            </th>
            <th className={head} style={{ width: '160px' }}>
              Predecessors
            </th>
            <th className={head} style={{ width: '100px' }}>
              Budget
            </th>
            <th className={head} style={{ width: '80px' }}>
              % Complete
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const taskDepth = depth(task.wbsPath)
            const isAlternate = taskDepth % 2 === 1
            
            return (
              <tr
                key={task.id}
                className={`
                  hover:bg-gray-50 transition-colors duration-150
                  ${selectedTaskId === task.id ? 'bg-sky-50' : 'bg-white'}
                `}
                onClick={() => onSelectTask(task.id)}
              >
                {/* WBS Path */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} rounded-l-md border border-r-0 border-gray-200`}>
                  <span className="text-xs font-mono text-gray-500">
                    {task.wbsPath}
                  </span>
                </td>

                {/* Task Name */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
                  <div 
                    className="relative indent-guide flex items-center justify-center"
                    style={{ paddingLeft: `${taskDepth * 1.25}rem` }}
                  >
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
                        className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-center"
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCellClick(task.id, 'name', task.name)
                        }}
                        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150"
                      >
                        {task.name}
                      </div>
                    )}
                  </div>
                </td>

                {/* Duration */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
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
                      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150"
                    >
                      {task.duration}d
                    </div>
                  )}
                </td>

                {/* Start Date */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
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
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
                  <span className="text-gray-500">
                    {new Date(task.endDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </td>

                {/* Predecessors */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
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
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} border border-x-0 border-gray-200`}>
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
                      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150"
                    >
                      {formatCurrency(task.budget)}
                    </div>
                  )}
                </td>

                {/* % Complete */}
                <td className={`${cell} ${isAlternate ? "bg-gray-50" : ""} rounded-r-md border border-l-0 border-gray-200`}>
                  {isEditing(task.id, 'percentComplete') ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editingState.value}
                      onChange={(e) => handleStartEdit(task.id, 'percentComplete', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
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
                        handleCellClick(task.id, 'percentComplete', task.percentComplete)
                      }}
                      className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150"
                    >
                      {task.percentComplete}%
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
} 