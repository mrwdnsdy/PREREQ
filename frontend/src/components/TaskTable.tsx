import React, { useState, useRef, useEffect, useCallback } from 'react'
import { FixedSizeList as List } from 'react-window'
import { DatePickerCell } from './DatePickerCell'
import { RelationshipSelector } from './RelationshipSelector'
import { Task } from '../services/scheduleApi'

interface TaskTableProps {
  tasks: Task[]
  allTasks: Task[]
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void
  onDeleteTask: (taskId: string) => void
  selectedTaskId?: string
  onSelectTask: (taskId: string | null) => void
  onCircularError?: (error: string) => void
  className?: string
}

interface EditingState {
  taskId: string | null
  field: string | null
  value: any
}

interface TaskRowProps {
  index: number
  style: React.CSSProperties
  data: {
    tasks: Task[]
    allTasks: Task[]
    editingState: EditingState
    selectedTaskId?: string
    onUpdateTask: (taskId: string, updates: Partial<Task>) => void
    onDeleteTask: (taskId: string) => void
    onSelectTask: (taskId: string | null) => void
    onStartEdit: (taskId: string, field: string, value: any) => void
    onSaveEdit: () => void
    onCancelEdit: () => void
    onCircularError?: (error: string) => void
  }
}

const TaskRow: React.FC<TaskRowProps> = ({ index, style, data }) => {
  const {
    tasks,
    allTasks,
    editingState,
    selectedTaskId,
    onUpdateTask,
    onDeleteTask,
    onSelectTask,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onCircularError
  } = data

  const task = tasks[index]
  const isSelected = selectedTaskId === task.id
  const isEditing = editingState.taskId === task.id

  const handleCellClick = (field: string, value: any) => {
    onSelectTask(task.id)
    onStartEdit(task.id, field, value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      onSaveEdit()
    }
    if (e.key === 'Escape') {
      onCancelEdit()
    }
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      onSelectTask(tasks[index - 1].id)
    }
    if (e.key === 'ArrowDown' && index < tasks.length - 1) {
      e.preventDefault()
      onSelectTask(tasks[index + 1].id)
    }
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

  return (
    <div
      style={style}
      className={`
        flex border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150
        ${isSelected ? 'bg-sky-50 ring-1 ring-sky-200' : ''}
      `}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* WBS Path */}
      <div className="w-24 px-4 py-2 text-sm font-mono text-gray-500 flex items-center border-r border-gray-200">
        {task.wbsPath}
      </div>

      {/* Task Name */}
      <div className="flex-1 min-w-48 px-4 py-2 border-r border-gray-200">
        {isEditing && editingState.field === 'name' ? (
          <input
            type="text"
            value={editingState.value}
            onChange={(e) => onStartEdit(task.id, 'name', e.target.value)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="w-full px-2 py-1 text-sm border border-sky-500 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            autoFocus
          />
        ) : (
          <div
            onClick={() => handleCellClick('name', task.name)}
            className="text-sm text-gray-900 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150"
          >
            {task.name}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="w-24 px-4 py-2 border-r border-gray-200">
        {isEditing && editingState.field === 'duration' ? (
          <input
            type="number"
            min="1"
            value={editingState.value}
            onChange={(e) => onStartEdit(task.id, 'duration', parseInt(e.target.value) || 1)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="w-full px-2 py-1 text-sm border border-sky-500 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            autoFocus
          />
        ) : (
          <div
            onClick={() => handleCellClick('duration', task.duration)}
            className="text-sm text-gray-900 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150 text-center"
          >
            {task.duration}d
          </div>
        )}
      </div>

      {/* Start Date */}
      <div className="w-32 px-4 py-2 border-r border-gray-200">
        <DatePickerCell
          value={task.startDate}
          onChange={(date) => {
            const endDate = calculateEndDate(date, task.duration)
            onUpdateTask(task.id, { startDate: date, endDate })
          }}
          className="w-full"
        />
      </div>

      {/* End Date (read-only) */}
      <div className="w-32 px-4 py-2 text-sm text-gray-500 flex items-center border-r border-gray-200">
        {new Date(task.endDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })}
      </div>

      {/* Predecessors */}
      <div className="w-64 px-4 py-2 border-r border-gray-200">
        <RelationshipSelector
          value={task.predecessors}
          onChange={(relations) => onUpdateTask(task.id, { predecessors: relations })}
          availableTasks={allTasks}
          currentTaskId={task.id}
          onCircularError={onCircularError}
          className="w-full"
        />
      </div>

      {/* Budget */}
      <div className="w-32 px-4 py-2 border-r border-gray-200">
        {isEditing && editingState.field === 'budget' ? (
          <input
            type="number"
            min="0"
            step="100"
            value={editingState.value}
            onChange={(e) => onStartEdit(task.id, 'budget', parseFloat(e.target.value) || 0)}
            onBlur={onSaveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            className="w-full px-2 py-1 text-sm border border-sky-500 rounded focus:outline-none focus:ring-1 focus:ring-sky-500"
            autoFocus
          />
        ) : (
          <div
            onClick={() => handleCellClick('budget', task.budget)}
            className="text-sm text-gray-900 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors duration-150 text-right"
          >
            {formatCurrency(task.budget)}
          </div>
        )}
      </div>

      {/* % Complete */}
      <div className="w-32 px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="100"
            value={task.percentComplete}
            onChange={(e) => onUpdateTask(task.id, { percentComplete: parseInt(e.target.value) })}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #0ea5e9 0%, #0ea5e9 ${task.percentComplete}%, #e5e7eb ${task.percentComplete}%, #e5e7eb 100%)`
            }}
          />
          <span className="text-xs text-gray-500 w-8 text-right">
            {task.percentComplete}%
          </span>
        </div>
      </div>
    </div>
  )
}

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  allTasks,
  onUpdateTask,
  onDeleteTask,
  selectedTaskId,
  onSelectTask,
  onCircularError,
  className = ''
}) => {
  const [editingState, setEditingState] = useState<EditingState>({
    taskId: null,
    field: null,
    value: null
  })
  const listRef = useRef<List>(null)

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

  // Auto-scroll to selected task
  useEffect(() => {
    if (selectedTaskId && listRef.current) {
      const taskIndex = tasks.findIndex(t => t.id === selectedTaskId)
      if (taskIndex >= 0) {
        listRef.current.scrollToItem(taskIndex, 'smart')
      }
    }
  }, [selectedTaskId, tasks])

  const itemData = {
    tasks,
    allTasks,
    editingState,
    selectedTaskId,
    onUpdateTask,
    onDeleteTask,
    onSelectTask,
    onStartEdit: handleStartEdit,
    onSaveEdit: handleSaveEdit,
    onCancelEdit: handleCancelEdit,
    onCircularError
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
        <div className="w-24 px-4 py-3 border-r border-gray-200">WBS</div>
        <div className="flex-1 min-w-48 px-4 py-3 border-r border-gray-200">Task Name</div>
        <div className="w-24 px-4 py-3 border-r border-gray-200 text-center">Duration</div>
        <div className="w-32 px-4 py-3 border-r border-gray-200">Start Date</div>
        <div className="w-32 px-4 py-3 border-r border-gray-200">End Date</div>
        <div className="w-64 px-4 py-3 border-r border-gray-200">Predecessors</div>
        <div className="w-32 px-4 py-3 border-r border-gray-200 text-right">Budget</div>
        <div className="w-32 px-4 py-3">% Complete</div>
      </div>

      {/* Task Rows */}
      {tasks.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-500">
          No tasks found. Add a WBS item and create tasks.
        </div>
      ) : (
        <List
          ref={listRef}
          height={Math.min(tasks.length * 60, 600)} // Max height of 600px
          itemCount={tasks.length}
          itemSize={60}
          itemData={itemData}
        >
          {TaskRow}
        </List>
      )}
    </div>
  )
} 