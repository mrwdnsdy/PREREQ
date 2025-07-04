import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, AlertCircle, ClipboardIcon, Upload, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { TaskTable } from '../components/TaskTable'
import { useAuth } from '../contexts/AuthContext'
import { useTasks, Task } from '../hooks/useTasks'
import api from '../services/api'

interface Project {
  id: string
  name: string
  client?: string
  startDate: string
  endDate: string
  budget?: number
  members: Array<{
    user: {
      id: string
      email: string
      fullName?: string
    }
    role: string
  }>
}

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

const ProjectDetail: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, loading: authLoading, user } = useAuth()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [view, setView] = useState<'schedule' | 'details'>('schedule')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showWbs, setShowWbs] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)

  // Get project info for the header
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then(res => res.data),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
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
    isDeleting: isDeletingTask
  } = useTasks(projectId || '')

  // Check if current user can delete this project (ADMIN role)
  // Make this more resilient to avoid disappearing delete buttons during hot reloads
  const canDelete = React.useMemo(() => {
    if (!project?.members || !user?.email) return false
    
    const userMember = project.members.find(member => 
      member.user.email === user.email
    )
    
    return userMember?.role === 'ADMIN'
  }, [project?.members, user?.email])

  // Task creation handler
  const handleAddTask = async (parentId?: string) => {
    if (!projectId) return
    
    try {
      console.log('ProjectDetail: Creating new task with parentId:', parentId)
      
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

  const handleDeleteProject = async () => {
    if (!projectId || !canDelete) return

    setIsDeleting(true)
    try {
      await api.delete(`/projects/${projectId}`)
      toast.success('Project deleted successfully')
      
      // Invalidate queries and navigate to projects list
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio'] })
      navigate('/projects')
    } catch (error: any) {
      console.error('Failed to delete project:', error)
      toast.error(error.response?.data?.message || 'Failed to delete project')
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
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
          <p className="text-gray-600 mb-4">Please log in to access the project.</p>
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
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Project</h2>
          <p className="text-gray-600">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <main className="h-screen grid grid-rows-[auto_1fr]">
        {/* Header */}
        <header className="h-14 flex items-center justify-between border-b bg-white/80 backdrop-blur px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-900">
              {project?.name || 'Project Schedule'}
            </h1>
            {project?.client && (
              <span className="text-sm text-gray-500">• {project.client}</span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Update Schedule Button - shown when there are pending changes */}
            {(isUpdating || isAdding || isDeletingTask) && (
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

            {/* Import Schedule Button */}
            <button 
              onClick={() => navigate(`/projects/${projectId}/import-schedule`)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-sky-500"
            >
              <Upload className="w-4 h-4" />
              Import Schedule
            </button>

            {/* Delete Project Button - only for ADMIN users */}
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:ring-2 focus:ring-red-500"
              >
                <Trash2 className="w-4 h-4" />
                Delete Project
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
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <ClipboardIcon className="h-10 w-10 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No tasks yet</p>
                </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowDeleteConfirm(false)} />
            
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <Trash2 className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                      Delete Project
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Are you sure you want to delete "{project?.name}"? This action will permanently remove the project and all its tasks, relationships, and members. This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteProject}
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-3 sm:w-auto"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Deleting...
                    </>
                  ) : (
                    'Delete Project'
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed sm:mt-0 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ProjectDetail 