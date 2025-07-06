import React, { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Plus, AlertCircle, ClipboardIcon, ArrowLeft, Settings, Eye, EyeOff, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { TaskTable } from '../components/TaskTable'
import { ResourceDrawer } from '../components/drawers/ResourceDrawer'
import { useAuth } from '../contexts/AuthContext'
import { useTasks, Task } from '../hooks/useTasks'

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
  const location = useLocation()
  const queryClient = useQueryClient()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showWbs, setShowWbs] = useState(true)
  const [isResourceDrawerOpen, setIsResourceDrawerOpen] = useState(true)
  const [isResourceDrawerCollapsed, setIsResourceDrawerCollapsed] = useState(true)
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  const [columnVisibility, setColumnVisibility] = useState({
    level: true,
    id: true,
    description: true,
    type: true,
    plannedDuration: true,
    startDate: true,
    finishDate: true,
    predecessor: true,
    successor: true,
    remainingDuration: true,
    baselineStartDate: false,
    baselineFinishDate: false,
    accountableOrganization: true,
    responsiblePersonnel: true,
    projectManager: true,
    flag: false,
    reasoning: false,
    juniorDesign: false,
    intermediateDesign: false,
    seniorDesign: false,
    budget: true,
    progress: true,
  })
  
  const {
    tasks,
    isLoading,
    error,
    addTask,
    updateTask,
    deleteTask,
    isUpdating,
    isAdding,
    isDeleting
  } = useTasks(projectId || '')

  // Handle import success notification
  useEffect(() => {
    if (location.state?.importSuccess) {
      toast.success(location.state.message || 'Schedule imported successfully!')
      // Clear the state to prevent the notification from showing again
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, navigate, location.pathname])

  // Task creation handler
  const handleAddTask = async (parentId?: string) => {
    if (!projectId) return
    
    try {
      console.log('SchedulePage: Creating new task with parentId:', parentId)
      
      // No WBS code generation - let backend handle it
      const newTask: Partial<Task> = {
        title: 'New Task',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        parentId: parentId || null,
        duration: 7,
        isMilestone: false,
        budget: 0,
        resourceRole: '',
        resourceQty: 1
      }

      await addTask(newTask)
    } catch (err) {
      console.error('Failed to create task:', err)
      // Error notification is handled by useTasks hook
    }
  }

  // Wrapper function to match TaskTable's expected signature
  const handleAddTaskFromTable = async (task: Partial<Task>): Promise<void> => {
    await addTask(task)
  }

  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    updateTask(taskId, updates)
  }

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId)
  }

  const handleCircularError = (message: string) => {
    console.error('Circular dependency error:', message)
    toast.error(message)
  }

  // Find the selected task object
  const selectedTask = selectedTaskId ? tasks?.find(task => task.id === selectedTaskId) || null : null

  // Handle task selection - open resources panel when a task is selected
  const handleSelectTask = (taskId: string | null) => {
    setSelectedTaskId(taskId)
    if (taskId) {
      setIsResourceDrawerOpen(true)
      setIsResourceDrawerCollapsed(false)
    } else {
      setIsResourceDrawerOpen(false)
    }
  }

  // Resource drawer handlers
  const handleCloseResourceDrawer = () => {
    setIsResourceDrawerOpen(false)
    setSelectedTaskId(null)
  }

  const handleToggleResourceDrawer = () => {
    setIsResourceDrawerCollapsed(!isResourceDrawerCollapsed)
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
    <main className="h-screen flex flex-col relative">
      {/* Header */}
      <header className="h-12 flex items-center justify-between border-b bg-white/80 backdrop-blur px-4 relative z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-sky-500"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            Project Schedule
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Update Schedule Button - shown when there are pending changes */}
          {(isUpdating || isAdding || isDeleting) && (
            <button
              onClick={() => {
                // Force refresh the data and show success message
                queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
                toast.success('Schedule updated successfully!')
              }}
              className="inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Update Schedule
            </button>
          )}

          {/* Column Visibility Button */}
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-sky-500"
            >
              <Settings className="w-4 h-4" />
              Columns
            </button>
            
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50">
                <div className="px-3 py-2 text-sm text-gray-500 border-b border-gray-200">
                  Show/Hide Columns
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium">Basic Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Level
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    ID
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Description
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Type
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Schedule Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Planned Duration
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Start Date
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Finish Date
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Remaining Duration
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Progress
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Dependency Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Predecessor
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Successor
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Baseline Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Baseline Start Date
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Baseline Finish Date
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Resource Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Accountable Organization
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Responsible Personnel
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Project Manager
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Design Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Junior Design
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Intermediate Design
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Senior Design
                  </button>
                  
                  <div className="px-3 py-1 text-xs text-gray-400 font-medium mt-2">Other Columns</div>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <Eye className="w-3 h-3" />
                    Budget
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Flag
                  </button>
                  <button className="w-full text-left px-3 py-1 text-sm hover:bg-gray-100 flex items-center gap-2">
                    <EyeOff className="w-3 h-3" />
                    Reasoning
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="flex-1 overflow-hidden">
        {!tasks || tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ClipboardIcon className="h-10 w-10 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No tasks yet</p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <div className="flex min-w-max">
              <TaskTable
                tasks={tasks || []}
                allTasks={tasks || []}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onSelectTask={handleSelectTask}
                selectedTaskId={selectedTaskId}
                onAddTask={handleAddTaskFromTable}
                projectId={projectId}
                showWbs={showWbs}
                onToggleWbs={setShowWbs}
              />
              {/* Invisible spacer equal to drawer width so last columns are reachable */}
              <div className="w-80 shrink-0" />
            </div>
          </div>
        )}
      </section>

      {/* Resource Drawer */}
      <ResourceDrawer
        selectedTask={selectedTask}
        isOpen={isResourceDrawerOpen}
        onClose={handleCloseResourceDrawer}
        onToggleCollapse={handleToggleResourceDrawer}
        isCollapsed={isResourceDrawerCollapsed}
        allTasks={tasks || []}
        projectId={projectId || ''}
      />

      {/* Click outside to close column menu */}
      {showColumnMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowColumnMenu(false)}
        />
      )}
    </main>
  )
}

export default SchedulePage 