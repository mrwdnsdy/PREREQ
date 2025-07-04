import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, AlertCircle, ClipboardIcon, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [view, setView] = useState<'schedule' | 'details'>('schedule')
  const [showWbs, setShowWbs] = useState(true)
  
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
        </div>
        
        <div className="flex items-center gap-4">
          {/* Update Schedule Button - shown when there are pending changes */}
          {(isUpdating || isAdding || isDeleting) && (
            <button
              onClick={() => {
                // Force refresh the data and show success message
                queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
                toast.success('Schedule updated successfully!')
              }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Update Schedule
            </button>
          )}
          
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
          

        </div>
      </header>

      {/* Content */}
      <section className="overflow-auto">
        {!tasks || tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ClipboardIcon className="h-10 w-10 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No tasks yet</p>
            </div>
          </div>
        ) : (
          <TaskTable
            tasks={tasks || []}
            allTasks={tasks || []}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onAddTask={handleAddTaskFromTable}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onCircularError={handleCircularError}
            view={view}
            showWbs={showWbs}
            onToggleWbs={setShowWbs}
          />
        )}
      </section>
    </main>
  )
}

export default SchedulePage 