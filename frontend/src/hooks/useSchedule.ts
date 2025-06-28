import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { create } from 'zustand'
import { scheduleApi, WbsNode, Task, ScheduleData } from '../services/scheduleApi'

interface ScheduleStore {
  collapsedNodes: Set<string>
  toggleCollapse: (nodeId: string) => void
  selectedTask: string | null
  setSelectedTask: (taskId: string | null) => void
}

const useScheduleStore = create<ScheduleStore>((set) => ({
  collapsedNodes: new Set(JSON.parse(localStorage.getItem('schedule-collapsed') || '[]')),
  toggleCollapse: (nodeId: string) => 
    set((state) => {
      const newCollapsed = new Set(state.collapsedNodes)
      if (newCollapsed.has(nodeId)) {
        newCollapsed.delete(nodeId)
      } else {
        newCollapsed.add(nodeId)
      }
      localStorage.setItem('schedule-collapsed', JSON.stringify([...newCollapsed]))
      return { collapsedNodes: newCollapsed }
    }),
  selectedTask: null,
  setSelectedTask: (taskId: string | null) => set({ selectedTask: taskId })
}))

export const useSchedule = (projectId: string) => {
  const queryClient = useQueryClient()
  const store = useScheduleStore()

  const {
    data: scheduleData,
    isLoading,
    error
  } = useQuery<ScheduleData>({
    queryKey: ['schedule', projectId],
    queryFn: () => scheduleApi.getSchedule(projectId),
    enabled: !!projectId
  })

  const createWbsMutation = useMutation({
    mutationFn: (node: Partial<WbsNode>) => scheduleApi.createWbsNode(projectId, node),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  const updateWbsMutation = useMutation({
    mutationFn: ({ nodeId, updates }: { nodeId: string; updates: Partial<WbsNode> }) =>
      scheduleApi.updateWbsNode(projectId, nodeId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  const deleteWbsMutation = useMutation({
    mutationFn: (nodeId: string) => scheduleApi.deleteWbsNode(projectId, nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  const createTaskMutation = useMutation({
    mutationFn: (task: Partial<Task>) => scheduleApi.createTask(projectId, task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) =>
      scheduleApi.updateTask(projectId, taskId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => scheduleApi.deleteTask(projectId, taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', projectId] })
    }
  })

  // Circular dependency detection using DFS
  const hasCircularDependency = (taskId: string, predecessorId: string, tasks: Task[]): boolean => {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const dfs = (currentTaskId: string): boolean => {
      if (recursionStack.has(currentTaskId)) return true
      if (visited.has(currentTaskId)) return false

      visited.add(currentTaskId)
      recursionStack.add(currentTaskId)

      const task = tasks.find(t => t.id === currentTaskId)
      if (task) {
        for (const pred of task.predecessors) {
          if (dfs(pred.predecessorId)) return true
        }
      }

      recursionStack.delete(currentTaskId)
      return false
    }

    // Check if adding this predecessor would create a cycle
    const tempTasks = tasks.map(t => 
      t.id === taskId 
        ? { ...t, predecessors: [...t.predecessors, { id: 'temp', predecessorId, type: 'FS' as const, lag: 0, predecessorName: '', predecessorWbs: '' }] }
        : t
    )

    return dfs(taskId)
  }

  const addWbsNode = (node: Partial<WbsNode>) => {
    createWbsMutation.mutate(node)
  }

  const updateWbsNode = (nodeId: string, updates: Partial<WbsNode>) => {
    updateWbsMutation.mutate({ nodeId, updates })
  }

  const deleteWbsNode = (nodeId: string) => {
    deleteWbsMutation.mutate(nodeId)
  }

  const addTask = (task: Partial<Task>) => {
    createTaskMutation.mutate(task)
  }

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    // Validate circular dependencies for predecessor updates
    if (updates.predecessors && scheduleData?.tasks) {
      for (const pred of updates.predecessors) {
        if (hasCircularDependency(taskId, pred.predecessorId, scheduleData.tasks)) {
          throw new Error('Circular dependency detected')
        }
      }
    }
    
    updateTaskMutation.mutate({ taskId, updates })
  }

  const deleteTask = (taskId: string) => {
    deleteTaskMutation.mutate(taskId)
  }

  return {
    wbsTree: scheduleData?.wbsTree || [],
    tasks: scheduleData?.tasks || [],
    isLoading,
    error,
    collapsedNodes: store.collapsedNodes,
    toggleCollapse: store.toggleCollapse,
    selectedTask: store.selectedTask,
    setSelectedTask: store.setSelectedTask,
    addWbsNode,
    updateWbsNode,
    deleteWbsNode,
    addTask,
    updateTask,
    deleteTask,
    hasCircularDependency: (taskId: string, predecessorId: string) => 
      hasCircularDependency(taskId, predecessorId, scheduleData?.tasks || [])
  }
} 