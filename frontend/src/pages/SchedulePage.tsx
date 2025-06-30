import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight, AlertCircle, ClipboardIcon, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { WbsTree } from '../components/WbsTree'
import { TaskTable } from '../components/TaskTable'
import { useAuth } from '../contexts/AuthContext'
import { useTasks, Task } from '../hooks/useTasks'
import { WbsNode } from '../services/scheduleApi'

const EmptyState: React.FC<{
  icon: React.ReactNode
  title: string
  actionText: string
  onAction: () => void
}> = ({ icon, title, actionText, onAction }) => (
  <div className="flex flex-col items-center justify-center py-12">
    {icon}
    <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
    <button
      onClick={onAction}
      className="mt-4 inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
    >
      {actionText}
    </button>
  </div>
)

const SchedulePage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

  console.log('SchedulePage: Auth state:', { user, isAuthenticated, authLoading })
  console.log('SchedulePage: Project ID:', projectId)

  // Use the shared tasks hook
  const {
    tasks,
    isLoading: tasksLoading,
    updateTask,
    deleteTask,
    addTask,
    isUpdating,
    isDeleting,
    isAdding,
    error
  } = useTasks(projectId || '')

  // Helper function to calculate WBS level (same logic as TaskTable)
  const getWbsLevel = (wbsPath: string): number => {
    if (!wbsPath) return 1
    // Remove trailing zeros and count meaningful levels
    const parts = wbsPath.split('.').filter(part => part !== '0' && part !== '')
    return Math.max(1, parts.length)
  }

  // Convert tasks to WBS tree structure
  const wbsTree = useMemo(() => {
    if (!tasks || tasks.length === 0) return []
    
    console.log('Converting tasks to WBS tree:', tasks)
    
    // Create a map to store all nodes
    const nodeMap = new Map<string, WbsNode>()
    
    // First pass: Create all nodes using WBS path level calculation
    tasks.forEach(task => {
      const wbsLevel = getWbsLevel(task.wbsPath || task.wbsCode || '')
      const node: WbsNode = {
        id: task.id,
        code: task.wbsPath || task.wbsCode || '',
        name: task.name,
        parentId: task.parentId || undefined,
        children: [],
        level: wbsLevel, // Use calculated level from WBS path
        collapsed: false
      }
      nodeMap.set(task.id, node)
    })
    
    // Second pass: Build hierarchy based on parent-child relationships
    const rootNodes: WbsNode[] = []
    
    tasks.forEach(task => {
      const node = nodeMap.get(task.id)
      if (!node) return
      
      if (task.parentId) {
        // Find parent and add this node as child
        const parent = nodeMap.get(task.parentId)
        if (parent) {
          parent.children.push(node)
        } else {
          // Parent not found, treat as root
          rootNodes.push(node)
        }
      } else {
        // No parent, this is a root node
        rootNodes.push(node)
      }
    })
    
    // Sort nodes by WBS code at each level
    const sortNodesByWbs = (nodes: WbsNode[]) => {
      nodes.sort((a, b) => {
        // Simple alphanumeric sort for WBS codes
        return a.code.localeCompare(b.code, undefined, { numeric: true })
      })
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortNodesByWbs(node.children)
        }
      })
    }
    
    sortNodesByWbs(rootNodes)
    
    console.log('Generated WBS tree with WBS path levels:', rootNodes)
    return rootNodes
  }, [tasks])

  const isLoading = tasksLoading

  const handleToggleCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId)
      } else {
        newSet.add(nodeId)
      }
      return newSet
    })
  }

  const handleUpdateWbsNode = (nodeId: string, updates: Partial<WbsNode>) => {
    // Find the corresponding task and update it
    const task = tasks?.find(t => t.id === nodeId)
    if (task) {
      const taskUpdates: Partial<Task> = {}
      if (updates.name) taskUpdates.name = updates.name
      if (updates.code) taskUpdates.wbsPath = updates.code
      
      handleUpdateTask(nodeId, taskUpdates)
    }
  }

  const handleAddWbsChild = (parentId: string) => {
    // Find parent task to determine the new task's level and WBS code
    const parentTask = tasks?.find(t => t.id === parentId)
    if (parentTask) {
      const newLevel = (parentTask.level || 1) + 1
      const childCount = tasks?.filter(t => t.parentId === parentId).length || 0
      const newWbsCode = `${parentTask.wbsPath || parentTask.wbsCode}.${childCount + 1}`
      
      const newTaskData: Partial<Task> = {
        name: 'New Task',
        parentId: parentId,
        level: newLevel,
        wbsPath: newWbsCode,
        wbsCode: newWbsCode,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      }
      
      handleAddTask(newTaskData)
    }
  }

  const handleAddWbsSibling = (nodeId: string) => {
    const task = tasks?.find(t => t.id === nodeId)
    if (task) {
      const siblingCount = tasks?.filter(t => t.parentId === task.parentId).length || 0
      const basePath = task.parentId 
        ? tasks?.find(t => t.id === task.parentId)?.wbsPath || tasks?.find(t => t.id === task.parentId)?.wbsCode || ''
        : ''
      
      const newWbsCode = basePath 
        ? `${basePath}.${siblingCount + 1}`
        : `${siblingCount + 1}`
      
      const newTaskData: Partial<Task> = {
        name: 'New Task',
        parentId: task.parentId,
        level: task.level,
        wbsPath: newWbsCode,
        wbsCode: newWbsCode,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      }
      
      handleAddTask(newTaskData)
    }
  }

  const handleDeleteWbsNode = (nodeId: string) => {
    handleDeleteTask(nodeId)
  }

  const handleSelectWbsNode = (nodeId: string) => {
    setSelectedTaskId(nodeId)
  }

  const handleAddWbs = async () => {
    // Add root level WBS item
    const rootCount = tasks?.filter(t => !t.parentId).length || 0
    const newWbsCode = `${rootCount + 1}`
    
    const newTaskData: Partial<Task> = {
      name: 'New WBS Item',
      level: 1,
      wbsPath: newWbsCode,
      wbsCode: newWbsCode,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    }
    
    handleAddTask(newTaskData)
  }

  const handleAddTask = async (taskData?: Partial<Task>) => {
    try {
      console.log('SchedulePage: handleAddTask called with:', taskData)
      addTask(taskData || {})
    } catch (error: any) {
      console.error('SchedulePage: Error in handleAddTask:', error)
      toast.error('Failed to add task')
    }
  }

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    console.log('SchedulePage: handleUpdateTask called:', { taskId, updates })
    updateTask(taskId, updates)
  }

  const handleDeleteTask = (taskId: string) => {
    console.log('SchedulePage: handleDeleteTask called:', taskId)
    deleteTask(taskId)
  }

  const handleCircularError = (message: string) => {
    console.error('Circular dependency error:', message)
    toast.error(message)
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading authentication...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please log in to access the schedule.</p>
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading schedule...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Schedule</h2>
          <p className="text-gray-600">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <main className="h-screen grid grid-rows-[auto_1fr]">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between border-b bg-white/80 backdrop-blur px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-sky-500"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            Project Schedule
          </h1>
          <span className="text-sm text-gray-500">
            {projectId}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddWbs}
            className="inline-flex items-center gap-1 rounded-md border border-sky-600 px-4 py-1.5 text-sm font-semibold text-sky-600 hover:bg-sky-50 focus:ring-2 focus:ring-sky-500"
          >
            <Plus className="w-4 h-4" />
            Add WBS
          </button>
          
          <button
            onClick={() => handleAddTask()}
            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 focus:ring-2 focus:ring-sky-500"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="grid grid-cols-[280px_1fr] overflow-hidden max-md:grid-cols-1">
        <aside className="border-r overflow-auto bg-white max-md:hidden min-w-0">
          <WbsTree
            nodes={wbsTree}
            collapsedNodes={collapsedNodes}
            onToggleCollapse={handleToggleCollapse}
            onUpdateNode={handleUpdateWbsNode}
            onAddChild={handleAddWbsChild}
            onAddSibling={handleAddWbsSibling}
            onDeleteNode={handleDeleteWbsNode}
            onSelectNode={handleSelectWbsNode}
            selectedNodeId={selectedTaskId}
            className="h-full"
          />
        </aside>

        <section className="overflow-auto">
          {!tasks || tasks.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={<ClipboardIcon className="h-10 w-10 text-gray-300" />}
                title="No tasks yet"
                actionText="+ Add Task"
                onAction={() => handleAddTask()}
              />
            </div>
          ) : (
            <TaskTable
              tasks={tasks || []}
              allTasks={tasks || []}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onAddTask={handleAddTask}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onCircularError={handleCircularError}
            />
          )}
        </section>
      </div>
    </main>
  )
}

export default SchedulePage 