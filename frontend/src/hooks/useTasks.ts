import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../services/api'

// Backend task structure (what comes from API)
interface BackendTask {
  id: string
  activityId: string
  title: string
  wbsCode: string
  startDate: string
  endDate: string
  isMilestone: boolean
  costLabor: number | { toString(): string } // Decimal from database
  costMaterial: number | { toString(): string } // Decimal from database
  costOther: number | { toString(): string } // Decimal from database
  level: number
  projectId: string
  parentId?: string
  description?: string
  resourceRole?: string
  resourceQty?: number
  resourceUnit?: string
  predecessors: Array<{
    id: string
    predecessorId: string
    type: string
    lag: number
    predecessor: {
      id: string
      activityId: string
      title: string
      wbsCode: string
    }
  }>
  successors: Array<{
    id: string
    successorId: string
    type: string
    lag: number
    successor: {
      id: string
      activityId: string
      title: string
      wbsCode: string
    }
  }>
  children: BackendTask[]
  createdAt: string
  updatedAt: string
}

// Frontend task structure (what TaskTable expects)
export interface Task {
  id: string
  activityId: string
  name: string
  title?: string // For backwards compatibility
  wbsPath: string
  wbsCode: string
  duration: number
  startDate: string
  endDate: string
  predecessors: Array<{
    id: string
    predecessorId: string
    type: string
    lag: number
    predecessor: {
      id: string
      activityId: string
      name: string
      wbsPath: string
    }
  }>
  budget: number
  totalCost?: number // For budget rollup calculations
  percentComplete: number
  progress?: number // For progress tracking
  isMilestone: boolean
  level: number
  parentId?: string
  // Resource fields
  resourceRole?: string
  resourceQty?: number
  resourceRole2?: string
  // Task-level lag for relationships
  lag?: number
}

// Transform backend task to frontend task
const transformBackendTask = (backendTask: BackendTask): Task => {
  const startDate = new Date(backendTask.startDate)
  const endDate = new Date(backendTask.endDate)
  const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  
  // Safely convert Decimal values to numbers for budget calculation
  const costLabor = typeof backendTask.costLabor === 'number' ? backendTask.costLabor : Number(backendTask.costLabor.toString())
  const costMaterial = typeof backendTask.costMaterial === 'number' ? backendTask.costMaterial : Number(backendTask.costMaterial.toString())
  const costOther = typeof backendTask.costOther === 'number' ? backendTask.costOther : Number(backendTask.costOther.toString())
  
  return {
    id: backendTask.id,
    activityId: backendTask.activityId,
    name: backendTask.title,
    title: backendTask.title, // For backwards compatibility
    wbsPath: backendTask.wbsCode,
    wbsCode: backendTask.wbsCode,
    duration,
    startDate: backendTask.startDate,
    endDate: backendTask.endDate,
    predecessors: backendTask.predecessors.map(p => ({
      ...p,
      predecessor: {
        id: p.predecessor.id,
        activityId: p.predecessor.activityId,
        name: p.predecessor.title,
        wbsPath: p.predecessor.wbsCode
      }
    })),
    budget: (isNaN(costLabor) ? 0 : costLabor) + (isNaN(costMaterial) ? 0 : costMaterial) + (isNaN(costOther) ? 0 : costOther),
    totalCost: (isNaN(costLabor) ? 0 : costLabor) + (isNaN(costMaterial) ? 0 : costMaterial) + (isNaN(costOther) ? 0 : costOther),
    percentComplete: 0, // This field doesn't exist in backend yet
    progress: 0, // For progress tracking
    isMilestone: backendTask.isMilestone,
    level: backendTask.level,
    parentId: backendTask.parentId,
    // Resource fields
    resourceRole: backendTask.resourceRole,
    resourceQty: backendTask.resourceQty,
    resourceRole2: '', // Not in backend yet
    // Task-level lag (could be derived from relationships)
    lag: 0
  }
}

export const useTasks = (projectId: string) => {
  const queryClient = useQueryClient()

  // Fetch tasks
  const { data: tasks, isLoading: tasksLoading, error } = useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: async () => {
      console.log('useTasks: Fetching tasks for project:', projectId)
      const response = await api.get(`/tasks/project/${projectId}`)
      console.log('useTasks: Raw backend response:', response.data)
      const backendTasks: BackendTask[] = response.data
      const transformedTasks = backendTasks.map(transformBackendTask)
      console.log('useTasks: Transformed tasks:', transformedTasks)
      return transformedTasks
    },
    enabled: !!projectId
  })

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      console.log('useTasks: Updating task:', { taskId, updates })
      // Transform frontend updates to backend format
      const backendUpdates: any = {}
      
      if (updates.name !== undefined) backendUpdates.title = updates.name
      if (updates.title !== undefined) backendUpdates.title = updates.title
      if (updates.wbsPath !== undefined) backendUpdates.wbsCode = updates.wbsPath
      if (updates.wbsCode !== undefined) backendUpdates.wbsCode = updates.wbsCode
      if (updates.startDate !== undefined) backendUpdates.startDate = updates.startDate
      if (updates.endDate !== undefined) backendUpdates.endDate = updates.endDate
      if (updates.isMilestone !== undefined) backendUpdates.isMilestone = updates.isMilestone
      if (updates.budget !== undefined) backendUpdates.costLabor = updates.budget
      if (updates.totalCost !== undefined) backendUpdates.costLabor = updates.totalCost
      if (updates.level !== undefined) backendUpdates.level = updates.level
      if (updates.parentId !== undefined) backendUpdates.parentId = updates.parentId
      if (updates.resourceRole !== undefined) backendUpdates.resourceRole = updates.resourceRole
      if (updates.resourceQty !== undefined) backendUpdates.resourceQty = updates.resourceQty
      if (updates.progress !== undefined) {
        // Handle progress updates (may need to store in a different field or calculate)
        console.log('Progress update not yet implemented in backend:', updates.progress)
      }
      
      console.log('useTasks: Backend updates:', backendUpdates)
      return api.patch(`/tasks/${taskId}`, backendUpdates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      toast.success('Task updated successfully')
    },
    onError: (error) => {
      console.error('useTasks: Error updating task:', error)
      toast.error('Failed to update task')
    }
  })

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => {
      console.log('useTasks: Deleting task:', taskId)
      return api.delete(`/tasks/${taskId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      toast.success('Task deleted successfully')
    },
    onError: (error) => {
      console.error('useTasks: Error deleting task:', error)
      toast.error('Failed to delete task')
    }
  })

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: (taskData: Partial<Task>) => {
      const taskCount = (tasks?.length || 0) + 1
      const wbsCode = taskData.wbsPath || taskData.wbsCode || `1.${taskCount}`
      
      console.log('useTasks: Adding task:', taskData)
      
      // Map frontend field names to backend DTO field names
      const backendTaskData = {
        projectId,
        wbsCode: wbsCode,
        title: taskData.name || `New Task ${taskCount}`,
        startDate: taskData.startDate || new Date().toISOString().split('T')[0],
        endDate: taskData.endDate || new Date().toISOString().split('T')[0],
        isMilestone: taskData.isMilestone || false,
        costLabor: taskData.budget || 0,
        costMaterial: 0,
        costOther: 0,
        description: '',
        resourceRole: null,
        resourceQty: null,
        resourceUnit: null,
        level: taskData.level || 1,
        parentId: taskData.parentId || null
      }
      
      console.log('useTasks: Backend task data:', backendTaskData)
      return api.post('/tasks', backendTaskData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      toast.success('Task added successfully')
    },
    onError: (error) => {
      console.error('useTasks: Error creating task:', error)
      toast.error('Failed to add task')
    }
  })

  return {
    tasks,
    isLoading: tasksLoading,
    error,
    updateTask: (taskId: string, updates: Partial<Task>) => updateTaskMutation.mutate({ taskId, updates }),
    deleteTask: (taskId: string) => deleteTaskMutation.mutate(taskId),
    addTask: (taskData: Partial<Task>) => addTaskMutation.mutate(taskData),
    isUpdating: updateTaskMutation.isPending,
    isDeleting: deleteTaskMutation.isPending,
    isAdding: addTaskMutation.isPending
  }
} 