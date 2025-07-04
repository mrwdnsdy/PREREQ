import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { Task } from '../hooks/useTasks'
import { TaskRelation } from '../services/scheduleApi'
import { DatePickerCell } from './DatePickerCell'
import { ChevronRight, Plus, Trash2, Edit2, Copy, Scissors, ArrowRight, Eye, EyeOff } from 'lucide-react'

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
  showWbs?: boolean
  onToggleWbs?: (show: boolean) => void
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
  isHeader: boolean
  isChild: boolean // Flag to indicate if this should be a child of afterTaskId
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  taskId: string | null
}

interface HeaderContextMenuState {
  visible: boolean
  x: number
  y: number
  column: string | null
}

interface ColumnVisibility {
  id: boolean
  type: boolean
  budget: boolean
  duration: boolean
  startDate: boolean
  finishDate: boolean
  progress: boolean
  role1: boolean
  role2: boolean
  predecessors: boolean
  lag: boolean
}

interface LagInputProps {
  value: number
  onChange: (value: number) => void
}

interface BudgetCellProps {
  value: number
  onChange: (value: number) => void
  rollupValue: number
  isRollup: boolean
}

interface BudgetMismatch {
  taskId: string
  taskName: string
  currentBudget: number
  rollupBudget: number
  difference: number
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
        className="w-full px-1 py-0.5 text-sm border rounded"
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

const BudgetCell: React.FC<BudgetCellProps> = ({ value, onChange, rollupValue, isRollup }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValue, setTempValue] = useState(value)
  const [showMismatchWarning, setShowMismatchWarning] = useState(false)

  const hasMismatch = !isRollup && Math.abs(value - rollupValue) > 0.01

  useEffect(() => {
    setTempValue(value)
  }, [value])

  const handleSave = () => {
    onChange(tempValue)
    setIsEditing(false)
    
    // Check for mismatches after save
    if (Math.abs(tempValue - rollupValue) > 0.01) {
      setShowMismatchWarning(true)
      setTimeout(() => setShowMismatchWarning(false), 3000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setTempValue(value)
      setIsEditing(false)
    }
  }

  if (isRollup) {
    return (
      <span className="text-gray-600 text-sm font-medium">
        {new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(rollupValue)}
      </span>
    )
  }

  return (
    <div className="relative">
      {isEditing ? (
        <input
          type="number"
          step="1000"
          min="0"
          value={tempValue}
          onChange={(e) => setTempValue(parseFloat(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-0.5 text-sm border rounded text-center"
          autoFocus
        />
      ) : (
        <div className="relative">
          <span 
            onClick={() => setIsEditing(true)}
            className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded text-sm"
            title={hasMismatch ? `Mismatch! Rollup: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(rollupValue)}` : ''}
          >
            {new Intl.NumberFormat('en-US', { 
              style: 'currency', 
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(value)}
          </span>

        </div>
      )}
      
      {showMismatchWarning && (
        <div className="absolute top-full left-0 z-10 bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm p-2 rounded shadow-lg whitespace-nowrap">
          ⚠️ Budget mismatch detected! Consider rebalancing resource loading.
        </div>
      )}
    </div>
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
  view,
  showWbs = true,
  onToggleWbs
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
    budget: 0,
    isHeader: true,
    isChild: false
  })

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    taskId: null
  })

  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set())
  
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    id: true,
    type: true,
    budget: true,
    duration: true,
    startDate: true,
    finishDate: true,
    progress: true,
    role1: true,
    role2: true,
    predecessors: true,
    lag: true
  })

  const [headerContextMenu, setHeaderContextMenu] = useState<HeaderContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    column: null
  })

  // Toggle task collapse state
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

  // Build hierarchy tree with collapse/expand functionality
  const buildTaskTree = (tasks: Task[]): Task[] => {
    // Create a map for quick parent lookups
    const taskMap = new Map(tasks.map(task => [task.id, { ...task, children: [] as Task[] }]))
    const rootTasks: (Task & { children: Task[] })[] = []

    // Build parent-child relationships
    tasks.forEach(task => {
      const taskWithChildren = taskMap.get(task.id)!
      if (task.parentId) {
        const parent = taskMap.get(task.parentId)
        if (parent) {
          parent.children.push(taskWithChildren)
        } else {
          rootTasks.push(taskWithChildren)
        }
      } else {
        rootTasks.push(taskWithChildren)
      }
    })

    // Sort children at each level by WBS code
    const sortChildrenRecursively = (tasks: (Task & { children: Task[] })[]) => {
      tasks.sort((a, b) => (a.wbsPath || a.wbsCode || '').localeCompare(b.wbsPath || b.wbsCode || ''))
      tasks.forEach(task => {
        if (task.children.length > 0) {
          sortChildrenRecursively(task.children as (Task & { children: Task[] })[])
        }
      })
    }
    
    sortChildrenRecursively(rootTasks)
    
    // Flatten tree into display order, respecting collapse state
    const flattenTree = (taskTree: (Task & { children: Task[] })[], result: Task[] = []): Task[] => {
      taskTree.forEach(taskWithChildren => {
        // Add the task itself (without the children property)
        const { children, ...task } = taskWithChildren
        result.push(task)
        
        // Add children only if this task is not collapsed
        if (children.length > 0 && !collapsedTasks.has(task.id)) {
          flattenTree(children as (Task & { children: Task[] })[], result)
        }
      })
      return result
    }
    
    return flattenTree(rootTasks)
  }

  // Check if a task should be visible (not hidden by collapsed parent)
  const isTaskVisible = (task: Task): boolean => {
    // Always show root level tasks
    if (!task.parentId) return true
    
    // Check if any ancestor is collapsed
    let currentTask = task
    while (currentTask.parentId) {
      const parent = tasks.find(t => t.id === currentTask.parentId)
      if (!parent) break
      
      // If parent is collapsed, this task should be hidden
      if (collapsedTasks.has(parent.id)) {
        return false
      }
      
      currentTask = parent
    }
    
    return true
  }

  // Use tree structure for proper hierarchy
  const visibleTasks = buildTaskTree(tasks)

  // Common styling classes
  const cell = "text-center align-middle py-2 px-2 border border-gray-200"
  const head = "sticky top-0 z-10 bg-white text-center text-sm font-semibold text-gray-500 py-3 border border-gray-200"

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
      // Leaf task (L4+) - calculate from resource loading
      return calculateResourceBudget(task)
    } else {
      // Parent task - sum children budgets
      return childTasks.reduce((sum, child) => sum + calculateBudgetRollup(child), 0)
    }
  }

  // Calculate budget from resource loading (for L4+ tasks)
  const calculateResourceBudget = (task: Task): number => {
    if (!task.resourceRole || !task.resourceQty || !task.duration) {
      return task.totalCost || 0
    }
    
    // Example hourly rates by role (could be from a lookup table)
    const hourlyRates: { [key: string]: number } = {
      'Developer': 150,
      'Designer': 120,
      'PM': 180,
      'QA': 100,
      'Architect': 200,
      'default': 125
    }
    
    const rate = hourlyRates[task.resourceRole] || hourlyRates['default']
    const hoursPerDay = 8
    const totalHours = task.duration * hoursPerDay * (task.resourceQty || 1)
    
    return totalHours * rate
  }

  // Check if task can have budget edited (L0-L3 only, not L4+)
  const canEditBudget = (task: Task): boolean => {
    const level = getWbsLevel(task.wbsPath || task.wbsCode || '')
    return level < 4 // L0, L1, L2, L3 can be edited
  }

  // Check if task can have resource loading edited (L4-L10 only)
  const canEditResourceLoading = (task: Task): boolean => {
    const level = getWbsLevel(task.wbsPath || task.wbsCode || '')
    return level >= 4 && level <= 10 // L4 through L10 can have resource loading
  }

  // Handle budget changes with validation and rollup logic
  const handleBudgetChange = (taskId: string, newBudget: number) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || !canEditBudget(task)) return

    // Update the task budget
    onUpdateTask(taskId, { totalCost: newBudget })

    // Check for mismatches with resource loading in children
    const mismatches = detectBudgetMismatches(taskId, newBudget)
    if (mismatches.length > 0) {
      promptUserForResourceAdjustment(mismatches)
    }
  }

  // Detect budget mismatches between parent budgets and resource loading
  const detectBudgetMismatches = (parentTaskId: string, parentBudget: number): BudgetMismatch[] => {
    const parentTask = tasks.find(t => t.id === parentTaskId)
    if (!parentTask) return []

    const descendants = getAllDescendants(parentTask.id)
    const leafTasks = descendants.filter(t => getWbsLevel(t.wbsPath || t.wbsCode || '') >= 4)
    
    if (leafTasks.length === 0) return []

    const totalResourceBudget = leafTasks.reduce((sum, task) => sum + calculateResourceBudget(task), 0)
    const difference = Math.abs(parentBudget - totalResourceBudget)
    
    if (difference > 0.01) {
      return [{
        taskId: parentTaskId,
        taskName: parentTask.title || parentTask.name || '',
        currentBudget: parentBudget,
        rollupBudget: totalResourceBudget,
        difference
      }]
    }

    return []
  }

  // Get all descendant tasks
  const getAllDescendants = (taskId: string): Task[] => {
    const children = tasks.filter(t => t.parentId === taskId)
    const allDescendants = [...children]
    
    children.forEach(child => {
      allDescendants.push(...getAllDescendants(child.id))
    })
    
    return allDescendants
  }

  // Prompt user for resource adjustment with rounding
  const promptUserForResourceAdjustment = (mismatches: BudgetMismatch[]) => {
    const mismatch = mismatches[0] // Handle first mismatch
    const adjustmentNeeded = mismatch.currentBudget - mismatch.rollupBudget
    
    if (Math.abs(adjustmentNeeded) < 0.01) return

    const shouldAdjust = window.confirm(
      `Budget mismatch detected!\n\n` +
      `Task: ${mismatch.taskName}\n` +
      `Current Budget: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mismatch.currentBudget)}\n` +
      `Resource Loading Total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mismatch.rollupBudget)}\n` +
      `Difference: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mismatch.difference)}\n\n` +
      `Would you like to automatically adjust resource loading to match the budget?`
    )

    if (shouldAdjust) {
      adjustResourceLoadingToMatchBudget(mismatch.taskId, mismatch.currentBudget)
    }
  }

  // Adjust resource loading to match budget using 0.25h rounding
  const adjustResourceLoadingToMatchBudget = (parentTaskId: string, targetBudget: number) => {
    const parentTask = tasks.find(t => t.id === parentTaskId)
    if (!parentTask) return

    const descendants = getAllDescendants(parentTask.id)
    const leafTasks = descendants.filter(t => 
      getWbsLevel(t.wbsPath || t.wbsCode || '') >= 4 && 
      t.resourceRole && t.resourceQty && t.duration
    )

    if (leafTasks.length === 0) return

    const totalCurrentBudget = leafTasks.reduce((sum, task) => sum + calculateResourceBudget(task), 0)
    if (totalCurrentBudget === 0) return

    const scaleFactor = targetBudget / totalCurrentBudget

    leafTasks.forEach(task => {
      const currentResourceBudget = calculateResourceBudget(task)
      const targetResourceBudget = currentResourceBudget * scaleFactor
      
      // Calculate new quantity needed
      const hourlyRate = getHourlyRate(task.resourceRole || 'default')
      const hoursPerDay = 8
      const totalHoursNeeded = targetResourceBudget / hourlyRate
      const newQuantity = totalHoursNeeded / (task.duration * hoursPerDay)
      
      // Round to nearest 0.25
      const roundedQuantity = Math.round(newQuantity * 4) / 4
      
      if (roundedQuantity > 0 && roundedQuantity !== task.resourceQty) {
        onUpdateTask(task.id, { resourceQty: roundedQuantity })
      }
    })
  }

  // Get hourly rate for a role
  const getHourlyRate = (role: string): number => {
    const hourlyRates: { [key: string]: number } = {
      'Developer': 150,
      'Designer': 120,
      'PM': 180,
      'QA': 100,
      'Architect': 200,
      'default': 125
    }
    return hourlyRates[role] || hourlyRates['default']
  }

  // Note: WBS codes are now generated server-side for guaranteed uniqueness

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

  const handleAddRow = (afterTaskId?: string, isHeaderParam: boolean = true) => {
    setNewRowState({
      isAdding: true,
      afterTaskId,
      wbsPath: '', // WBS will be generated server-side
      name: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      budget: 0,
      isHeader: isHeaderParam,
      isChild: false // This is a sibling
    })
  }

  const handleAddChild = (parentTaskId: string, isHeaderParam: boolean) => {
    setNewRowState({
      isAdding: true,
      afterTaskId: parentTaskId,
      wbsPath: '', // WBS will be generated server-side
      name: '',
      duration: 1,
      startDate: new Date().toISOString().split('T')[0],
      budget: 0,
      isHeader: isHeaderParam,
      isChild: true // This is a child
    })
  }

  const handleSaveNewRow = async () => {
    try {
      // Determine appropriate parentId based on isChild flag
      let parentId: string | null = null
      if (newRowState.afterTaskId) {
        const afterTask = tasks.find(t => t.id === newRowState.afterTaskId)
        if (afterTask) {
          if (newRowState.isChild) {
            // This is a child of the afterTask
            parentId = afterTask.id
          } else {
            // This is a sibling - inherit the same parent as the afterTask
            parentId = afterTask.parentId || null
          }
        }
      }

      const newTask: Partial<Task> = {
        // Remove wbsPath - let backend generate it
        name: newRowState.name || 'New Task',
        duration: newRowState.duration,
        startDate: newRowState.startDate,
        endDate: calculateEndDate(newRowState.startDate, newRowState.duration),
        budget: newRowState.budget,
        isMilestone: false,
        predecessors: [],
        parentId: parentId || undefined,
        isHeader: newRowState.isHeader
      }

      await onAddTask(newTask)
      
      setNewRowState({
        isAdding: false,
        wbsPath: '',
        name: '',
        duration: 1,
        startDate: new Date().toISOString().split('T')[0],
        budget: 0,
        isHeader: false,
        isChild: false
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
      budget: 0,
      isHeader: false,
      isChild: false
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

  const formatDate = (dateInput: string | Date): string => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
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

  const handleHeaderRightClick = (e: React.MouseEvent, column: string) => {
    e.preventDefault()
    setHeaderContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      column
    })
  }

  const hideHeaderContextMenu = () => {
    setHeaderContextMenu({ visible: false, x: 0, y: 0, column: null })
  }

  const toggleColumnVisibility = (column: keyof ColumnVisibility) => {
    setColumnVisibility(prev => ({
      ...prev,
      [column]: !prev[column]
    }))
    hideHeaderContextMenu()
  }

  const handleContextMenuAction = (action: string) => {
    if (contextMenu.taskId) {
      switch (action) {
        case 'add-header':
          // Sibling header (same level)
          handleAddRow(contextMenu.taskId, true)
          break
        case 'add-sub-header':
          // Child header
          handleAddChild(contextMenu.taskId, true)
          break
        case 'add-activity':
          // Child activity (leaf)
          handleAddChild(contextMenu.taskId, false)
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

  // Click outside handler for context menus
  React.useEffect(() => {
    const handleClickOutside = () => {
      hideContextMenu()
      hideHeaderContextMenu()
    }
    if (contextMenu.visible || headerContextMenu.visible) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu.visible, headerContextMenu.visible])

  const renderNewRow = () => {
    if (!newRowState.isAdding) return null

    const isHeader = newRowState.isHeader

    return (
      <tr className="bg-sky-50 border-l-4 border-sky-400">
        {/* Task Name with WBS */}
        <td className="py-1 px-2 text-left">
          <div className="flex flex-col gap-1">
            {showWbs && (
              <div className="w-full px-2 py-1 text-sm font-mono bg-gray-50 border rounded text-gray-500">
                Auto-generated
              </div>
            )}
            <input
              type="text"
              value={newRowState.name}
              onChange={(e) => setNewRowState(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newRowState.name.trim()) {
                  e.preventDefault()
                  handleSaveNewRow()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  handleCancelNewRow()
                }
              }}
              className="w-full rounded border px-2 py-1 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="Task name"
              autoFocus
            />
          </div>
        </td>

        {/* Activity ID */}
        {columnVisibility.id && (
          <td className={cell}>
            {isHeader ? (
              <span className="text-sm text-gray-400">-</span>
            ) : (
              <span className="text-sm font-mono text-gray-500 bg-gray-50 px-2 py-1 rounded">
                Auto-generated
              </span>
            )}
          </td>
        )}

        {view === 'schedule' ? (
          <>
            {/* Type */}
            {columnVisibility.type && (
              <td className={cell}>
                <span className="text-gray-600 text-sm">{isHeader ? 'Header' : 'Activity'}</span>
              </td>
            )}

            {/* Budget */}
            {columnVisibility.budget && (
              <td className={cell}>
                <input
                  type="number"
                  value={newRowState.budget}
                  onChange={(e) => setNewRowState(prev => ({ ...prev, budget: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-1 py-0.5 text-sm border rounded"
                />
              </td>
            )}

            {/* Duration */}
            {columnVisibility.duration && (
              <td className={cell}>
                <input
                  type="number"
                  value={newRowState.duration}
                  onChange={(e) => setNewRowState(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                  className="w-full px-1 py-0.5 text-sm border rounded"
                />
              </td>
            )}

            {/* Start Date */}
            {columnVisibility.startDate && (
              <td className={cell}>
                <DatePickerCell
                  value={newRowState.startDate}
                  onChange={(date) => setNewRowState(prev => ({ ...prev, startDate: date }))}
                />
              </td>
            )}

            {/* Finish Date */}
            {columnVisibility.finishDate && (
              <td className={cell}>
                {calculateEndDate(newRowState.startDate, newRowState.duration)}
              </td>
            )}

            {/* Progress % */}
            {columnVisibility.progress && (
              <td className={cell}>
                <div className="flex items-center gap-1 justify-center">
                  <span className="text-sm">0%</span>
                </div>
              </td>
            )}
          </>
        ) : (
          <>
            {/* Budget */}
            {columnVisibility.budget && (
              <td className={cell}>{formatCurrency(newRowState.budget)}</td>
            )}

            {/* Role1 */}
            {columnVisibility.role1 && (
              <td className={cell}>
                <span className="text-gray-400 text-sm">-</span>
              </td>
            )}

            {/* Role2 */}
            {columnVisibility.role2 && (
              <td className={cell}>
                <span className="text-gray-400 text-sm">-</span>
              </td>
            )}

            {/* Predecessors */}
            {columnVisibility.predecessors && (
              <td className={cell}>
                <span className="text-sm text-gray-600 font-mono">-</span>
              </td>
            )}

            {/* Lag */}
            {columnVisibility.lag && (
              <td className={cell}>
                <span className="text-sm">0</span>
              </td>
            )}
          </>
        )}
      </tr>
    )
  }

  return (
    <div className="relative">

      
      <table className="w-full table-auto border-collapse border border-gray-200">
        <thead>
          <tr className="bg-gray-50">
            <th className={head}>
              <div className="flex flex-col items-center justify-center">
                <span>WBS</span>
                {onToggleWbs && (
                  <label className="flex items-center gap-1 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={showWbs}
                      onChange={(e) => onToggleWbs(e.target.checked)}
                      className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-500">Show WBS Code</span>
                  </label>
                )}
              </div>
            </th>
            {columnVisibility.id && (
              <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'id')}>ID</th>
            )}
            {view === 'schedule' && (
              <>
                {columnVisibility.type && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'type')}>Type</th>
                )}
                {columnVisibility.budget && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'budget')}>Budget</th>
                )}
                {columnVisibility.duration && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'duration')}>Duration</th>
                )}
                {columnVisibility.startDate && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'startDate')}>Start Date</th>
                )}
                {columnVisibility.finishDate && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'finishDate')}>Finish Date</th>
                )}
                {columnVisibility.progress && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'progress')}>Progress</th>
                )}
              </>
            )}
            {view === 'details' && (
              <>
                {columnVisibility.budget && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'budget')}>Budget</th>
                )}
                {columnVisibility.role1 && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'role1')}>Role1</th>
                )}
                {columnVisibility.role2 && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'role2')}>Role2</th>
                )}
                {columnVisibility.predecessors && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'predecessors')}>Predecessors</th>
                )}
                {columnVisibility.lag && (
                  <th className={head} onContextMenu={(e) => handleHeaderRightClick(e, 'lag')}>Lag</th>
                )}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleTasks.map(task => (
            <React.Fragment key={task.id}>
              <tr
                className={`transition-colors ${
                  task.isHeader
                    ? getRowBackgroundColor(task.wbsPath || task.wbsCode || '')
                    : 'bg-white'
                } ${getBorderColor(task.wbsPath || task.wbsCode || '')} ${
                  selectedTaskId === task.id ? 'ring-2 ring-blue-400' : ''
                } hover:shadow-md transform hover:scale-[1.01] wbs-row border-l-4`}
                onContextMenu={(e) => handleRightClick(e, task.id)}
                onClick={() => onSelectTask?.(task.id)}
              >
                {/* Task Name with WBS */}
                <td className={cell}>
                  <div className="flex items-start gap-2">
                    {/* Indent text according to depth; Chevron floats in gutter */}
                    <div
                      style={{ paddingLeft: `${getIndentationLevel(task.wbsPath || task.wbsCode || '') * 1.25}rem` }}
                      className="relative flex-1"
                    >
                      {/* Chevron for collapsible parents */}
                      {allTasks.some(t => t.parentId === task.id) && (
                        <ChevronRight
                          className={`absolute -ml-4 h-4 w-4 cursor-pointer transition-transform text-gray-400 ${
                            collapsedTasks.has(task.id) ? 'rotate-0' : 'rotate-90'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCollapse(task.id)
                          }}
                        />
                      )}
                      
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {showWbs && (
                            <span className={`text-sm font-mono font-semibold px-1.5 py-0.5 rounded ${getWbsTextColor(task.wbsPath || task.wbsCode || '')}`}>
                              {formatWbsCode(task.wbsPath || task.wbsCode || '')}
                            </span>
                          )}
                        </div>
                        <span className={`text-base font-medium leading-tight ${getTaskNameTextColor(task.wbsPath || task.wbsCode || '')}`}>
                          {task.title || task.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Activity ID – blank for headers */}
                {columnVisibility.id && (
                  <td className={cell}>
                    {task.isHeader ? (
                      <span className="text-sm text-gray-400">-</span>
                    ) : (
                      <span className="text-sm font-mono font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {task.activityId}
                      </span>
                    )}
                  </td>
                )}

                {view === 'schedule' ? (
                  <>
                    {columnVisibility.type && (
                      <td className={cell}>
                        {task.isMilestone ? (
                          <span className="text-gray-600 text-sm">Milestone</span>
                        ) : task.isHeader ? (
                          <span className="text-gray-600 text-sm">Header</span>
                        ) : (
                          <span className="text-gray-600 text-sm">Activity</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.budget && (
                      <td className={cell}>
                        {canEditBudget(task) ? (
                          <BudgetCell
                            value={task.totalCost || 0}
                            onChange={(value) => handleBudgetChange(task.id, value)}
                            rollupValue={task.totalCost || 0}
                            isRollup={!canEditBudget(task)}
                          />
                        ) : (
                          <span className="text-gray-600 text-sm">
                            {formatCurrency(task.totalCost || 0)}
                          </span>
                        )}
                      </td>
                    )}
                    {columnVisibility.duration && (
                      <td className={cell}>
                        <span className="text-sm">
                          {task.duration}d
                        </span>
                      </td>
                    )}
                    {columnVisibility.startDate && (
                      <td className={cell}>
                        <DatePickerCell
                          value={task.startDate}
                          onChange={(date) => onUpdateTask(task.id, { startDate: date })}
                        />
                      </td>
                    )}
                    {columnVisibility.finishDate && (
                      <td className={cell}>
                        <DatePickerCell
                          value={task.endDate}
                          onChange={(date) => onUpdateTask(task.id, { endDate: date })}
                        />
                      </td>
                    )}
                    {columnVisibility.progress && (
                      <td className={cell}>
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={(task.progress ?? 0).toString()}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '')
                              const num = Math.max(0, Math.min(100, parseInt(cleaned || '0')))
                              onUpdateTask(task.id, { progress: num })
                            }}
                            className="w-8 px-0.5 py-0.5 text-sm border rounded text-center appearance-none"
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                      </td>
                    )}
                  </>
                ) : (
                  <>
                    {columnVisibility.budget && (
                      <td className={cell}>
                        {formatCurrency(task.totalCost || 0)}
                      </td>
                    )}
                    {columnVisibility.role1 && (
                      <td className={cell}>
                        {canEditResourceLoading(task) ? (
                          <input
                            type="text"
                            value={task.resourceRole || ''}
                            onChange={(e) =>
                              onUpdateTask(task.id, { resourceRole: e.target.value })
                            }
                            className="w-full px-1 py-0.5 text-sm border rounded"
                            placeholder="Role"
                          />
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.role2 && (
                      <td className={cell}>
                        {canEditResourceLoading(task) ? (
                          <input
                            type="text"
                            value={task.resourceRole2 || ''}
                            onChange={(e) =>
                              onUpdateTask(task.id, { resourceRole2: e.target.value })
                            }
                            className="w-full px-1 py-0.5 text-sm border rounded"
                            placeholder="Role 2"
                          />
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                    )}
                    {columnVisibility.predecessors && (
                      <td className={cell}>
                        <span className="text-sm text-gray-600 font-mono">
                          {task.predecessors?.map(p => p.predecessor.activityId).join(', ') || '-'}
                        </span>
                      </td>
                    )}
                    {columnVisibility.lag && (
                      <td className={cell}>
                        <LagInput
                          value={task.lag || 0}
                          onChange={(lag) => onUpdateTask(task.id, { lag })}
                        />
                      </td>
                    )}
                  </>
                )}
              </tr>
              {newRowState.isAdding && newRowState.afterTaskId === task.id && renderNewRow()}
            </React.Fragment>
          ))}
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
            onClick={() => handleContextMenuAction('add-header')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            Add Header
          </button>
          <button
            onClick={() => handleContextMenuAction('add-sub-header')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <ArrowRight className="w-3 h-3" />
            Add Sub Header
          </button>
          <button
            onClick={() => handleContextMenuAction('add-activity')}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <ArrowRight className="w-3 h-3" />
            Add Activity
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

      {/* Header Context Menu */}
      {headerContextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50"
          style={{
            left: headerContextMenu.x,
            top: headerContextMenu.y
          }}
        >
          <div className="px-3 py-1 text-sm text-gray-500 border-b border-gray-200 mb-1">
            Column: {headerContextMenu.column}
          </div>
          <button
            onClick={() => toggleColumnVisibility(headerContextMenu.column as keyof ColumnVisibility)}
            className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            <EyeOff className="w-3 h-3" />
            Hide Column
          </button>
          <hr className="my-1" />
          <div className="px-3 py-1 text-sm text-gray-500">Show/Hide Columns:</div>
          {Object.entries(columnVisibility).map(([key, visible]) => (
            <button
              key={key}
              onClick={() => toggleColumnVisibility(key as keyof ColumnVisibility)}
              className={`w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                visible ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
} 