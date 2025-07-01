import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, AlertCircle, ClipboardIcon, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { TaskTable } from '../components/TaskTable'
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
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [view, setView] = useState<'schedule' | 'details'>('schedule')
  
  const {
    tasks,
    isLoading,
    error,
    addTask,
    updateTask,
    deleteTask,
  } = useTasks(projectId || '')

  // Task creation handler
  const handleAddTask = async (parentId?: string) => {
    if (!projectId) return
    
    try {
      console.log('SchedulePage: Creating new task with parentId:', parentId)
      
      // Calculate next WBS code
      const existingTasks = tasks || []
      let newWbsCode = '1'
      
      if (parentId) {
        const parent = existingTasks.find(t => t.id === parentId)
        if (parent) {
          const siblings = existingTasks.filter(t => t.parentId === parentId)
          const maxSiblingCode = siblings.reduce((max, sibling) => {
            const parts = sibling.wbsCode.split('.')
            const lastPart = parseInt(parts[parts.length - 1] || '0')
            return Math.max(max, lastPart)
          }, 0)
          newWbsCode = `${parent.wbsCode}.${maxSiblingCode + 1}`
        }
      } else {
        const rootTasks = existingTasks.filter(t => !t.parentId)
        const maxRootCode = rootTasks.reduce((max, task) => {
          const firstPart = parseInt(task.wbsCode.split('.')[0] || '0')
          return Math.max(max, firstPart)
        }, 0)
        newWbsCode = `${maxRootCode + 1}`
      }

      const newTask: Partial<Task> = {
        title: 'New Task',
        wbsCode: newWbsCode,
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
      toast.success('Task created successfully!')
    } catch (err) {
      console.error('Failed to create task:', err)
      toast.error('Failed to create task. Please try again.')
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
      {/* Header */}
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
        
        <div className="flex items-center gap-4">
          {/* Schedule / Details Toggle */}
          <div className="flex items-center border border-gray-300 rounded-md">
            <button
              onClick={() => setView('schedule')}
              className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-colors ${
                view === 'schedule'
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setView('details')}
              className={`px-3 py-1.5 text-sm font-medium rounded-r-md transition-colors ${
                view === 'details'
                  ? 'bg-sky-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Details
            </button>
          </div>
          
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
            onAddTask={(taskData) => handleAddTask(taskData.parentId)}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onCircularError={handleCircularError}
            view={view}
          />
        )}
      </section>
    </main>
  )
}

export default SchedulePage 