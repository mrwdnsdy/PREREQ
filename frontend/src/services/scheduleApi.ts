import api from './api'

export interface WbsNode {
  id: string
  code: string
  name: string
  parentId?: string
  children: WbsNode[]
  level: number
  collapsed?: boolean
}

export interface Task {
  id: string
  wbsId: string
  wbsPath: string
  name: string
  duration: number
  startDate: string
  endDate: string
  predecessors: TaskRelation[]
  budget: number
  percentComplete: number
  projectId: string
}

export interface TaskRelation {
  id: string
  predecessorId: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lag: number
  predecessorName: string
  predecessorWbs: string
}

export interface ScheduleData {
  wbsTree: WbsNode[]
  tasks: Task[]
}

// Stubbed data for development
const mockWbsTree: WbsNode[] = [
  {
    id: 'wbs-1',
    code: '1',
    name: 'Project Planning',
    level: 1,
    children: [
      {
        id: 'wbs-1-1',
        code: '1.1',
        name: 'Requirements Gathering',
        parentId: 'wbs-1',
        level: 2,
        children: []
      },
      {
        id: 'wbs-1-2',
        code: '1.2',
        name: 'Design Phase',
        parentId: 'wbs-1',
        level: 2,
        children: []
      }
    ]
  },
  {
    id: 'wbs-2',
    code: '2',
    name: 'Development',
    level: 1,
    children: [
      {
        id: 'wbs-2-1',
        code: '2.1',
        name: 'Frontend Development',
        parentId: 'wbs-2',
        level: 2,
        children: []
      },
      {
        id: 'wbs-2-2',
        code: '2.2',
        name: 'Backend Development',
        parentId: 'wbs-2',
        level: 2,
        children: []
      }
    ]
  }
]

const mockTasks: Task[] = [
  {
    id: 'task-1',
    wbsId: 'wbs-1-1',
    wbsPath: '1.1',
    name: 'Stakeholder Interviews',
    duration: 5,
    startDate: '2025-07-01',
    endDate: '2025-07-07',
    predecessors: [],
    budget: 5000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  {
    id: 'task-2',
    wbsId: 'wbs-1-2',
    wbsPath: '1.2',
    name: 'UI/UX Design',
    duration: 10,
    startDate: '2025-07-08',
    endDate: '2025-07-21',
    predecessors: [
      {
        id: 'rel-1',
        predecessorId: 'task-1',
        type: 'FS',
        lag: 0,
        predecessorName: 'Stakeholder Interviews',
        predecessorWbs: '1.1'
      }
    ],
    budget: 8000,
    percentComplete: 25,
    projectId: 'test-project'
  },
  {
    id: 'task-3',
    wbsId: 'wbs-2-1',
    wbsPath: '2.1',
    name: 'Component Development',
    duration: 15,
    startDate: '2025-07-22',
    endDate: '2025-08-08',
    predecessors: [
      {
        id: 'rel-2',
        predecessorId: 'task-2',
        type: 'FS',
        lag: 0,
        predecessorName: 'UI/UX Design',
        predecessorWbs: '1.2'
      }
    ],
    budget: 12000,
    percentComplete: 0,
    projectId: 'test-project'
  }
]

export const scheduleApi = {
  async getSchedule(projectId: string): Promise<ScheduleData> {
    // In production, this would be:
    // const response = await api.get(`/projects/${projectId}/schedule`)
    // return response.data
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          wbsTree: mockWbsTree,
          tasks: mockTasks
        })
      }, 100)
    })
  },

  async createWbsNode(projectId: string, node: Partial<WbsNode>): Promise<WbsNode> {
    return new Promise(resolve => {
      setTimeout(() => {
        const newNode: WbsNode = {
          id: `wbs-${Date.now()}`,
          code: node.code || '1',
          name: node.name || 'New WBS Item',
          level: node.level || 1,
          children: [],
          ...node
        }
        resolve(newNode)
      }, 100)
    })
  },

  async updateWbsNode(projectId: string, nodeId: string, updates: Partial<WbsNode>): Promise<WbsNode> {
    return new Promise(resolve => {
      setTimeout(() => {
        // Mock update
        resolve({
          id: nodeId,
          code: '1',
          name: 'Updated WBS Item',
          level: 1,
          children: [],
          ...updates
        })
      }, 100)
    })
  },

  async deleteWbsNode(projectId: string, nodeId: string): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve()
      }, 100)
    })
  },

  async createTask(projectId: string, task: Partial<Task>): Promise<Task> {
    return new Promise(resolve => {
      setTimeout(() => {
        const newTask: Task = {
          id: `task-${Date.now()}`,
          wbsId: task.wbsId || '',
          wbsPath: task.wbsPath || '1',
          name: task.name || 'New Task',
          duration: task.duration || 1,
          startDate: task.startDate || new Date().toISOString().split('T')[0],
          endDate: task.endDate || new Date().toISOString().split('T')[0],
          predecessors: task.predecessors || [],
          budget: task.budget || 0,
          percentComplete: task.percentComplete || 0,
          projectId,
          ...task
        }
        resolve(newTask)
      }, 100)
    })
  },

  async updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    return new Promise(resolve => {
      setTimeout(() => {
        // Mock update with date calculations
        const task = mockTasks.find(t => t.id === taskId) || mockTasks[0]
        const updatedTask = { ...task, ...updates }
        
        // Recalculate end date if start or duration changed
        if (updates.startDate || updates.duration) {
          const startDate = new Date(updates.startDate || task.startDate)
          const duration = updates.duration || task.duration
          const endDate = new Date(startDate)
          endDate.setDate(endDate.getDate() + duration - 1)
          updatedTask.endDate = endDate.toISOString().split('T')[0]
        }
        
        resolve(updatedTask)
      }, 100)
    })
  },

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve()
      }, 100)
    })
  }
} 