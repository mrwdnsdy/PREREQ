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

// Initial mock data
const initialWbsTree: WbsNode[] = [
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

const initialTasks: Task[] = [
  // Level 1 - Project Planning
  {
    id: 'task-1',
    wbsId: 'wbs-1',
    wbsPath: '1',
    name: 'Project Planning Phase',
    duration: 20,
    startDate: '2025-07-01',
    endDate: '2025-07-28',
    predecessors: [],
    budget: 15000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 2 - Requirements
  {
    id: 'task-2',
    wbsId: 'wbs-1-1',
    wbsPath: '1.1',
    name: 'Requirements Gathering',
    duration: 8,
    startDate: '2025-07-01',
    endDate: '2025-07-10',
    predecessors: [],
    budget: 6000,
    percentComplete: 25,
    projectId: 'test-project'
  },
  // Level 3 - Stakeholder Activities
  {
    id: 'task-3',
    wbsId: 'wbs-1-1-1',
    wbsPath: '1.1.1',
    name: 'Stakeholder Interviews',
    duration: 3,
    startDate: '2025-07-01',
    endDate: '2025-07-03',
    predecessors: [],
    budget: 2500,
    percentComplete: 50,
    projectId: 'test-project'
  },
  {
    id: 'task-4',
    wbsId: 'wbs-1-1-2',
    wbsPath: '1.1.2',
    name: 'Requirements Documentation',
    duration: 5,
    startDate: '2025-07-04',
    endDate: '2025-07-10',
    predecessors: [
      {
        id: 'rel-1',
        predecessorId: 'task-3',
        type: 'FS',
        lag: 0,
        predecessorName: 'Stakeholder Interviews',
        predecessorWbs: '1.1.1'
      }
    ],
    budget: 3500,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 2 - Design
  {
    id: 'task-5',
    wbsId: 'wbs-1-2',
    wbsPath: '1.2',
    name: 'Design Phase',
    duration: 12,
    startDate: '2025-07-11',
    endDate: '2025-07-28',
    predecessors: [
      {
        id: 'rel-2',
        predecessorId: 'task-2',
        type: 'FS',
        lag: 0,
        predecessorName: 'Requirements Gathering',
        predecessorWbs: '1.1'
      }
    ],
    budget: 9000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 3 - UI Design
  {
    id: 'task-6',
    wbsId: 'wbs-1-2-1',
    wbsPath: '1.2.1',
    name: 'UI/UX Design',
    duration: 7,
    startDate: '2025-07-11',
    endDate: '2025-07-21',
    predecessors: [],
    budget: 5000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 4 - Wireframes
  {
    id: 'task-7',
    wbsId: 'wbs-1-2-1-1',
    wbsPath: '1.2.1.1',
    name: 'Wireframes',
    duration: 3,
    startDate: '2025-07-11',
    endDate: '2025-07-15',
    predecessors: [],
    budget: 2000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 4 - Prototypes
  {
    id: 'task-8',
    wbsId: 'wbs-1-2-1-2',
    wbsPath: '1.2.1.2',
    name: 'Interactive Prototypes',
    duration: 4,
    startDate: '2025-07-16',
    endDate: '2025-07-21',
    predecessors: [
      {
        id: 'rel-3',
        predecessorId: 'task-7',
        type: 'FS',
        lag: 0,
        predecessorName: 'Wireframes',
        predecessorWbs: '1.2.1.1'
      }
    ],
    budget: 3000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 1 - Development
  {
    id: 'task-9',
    wbsId: 'wbs-2',
    wbsPath: '2',
    name: 'Development Phase',
    duration: 30,
    startDate: '2025-07-29',
    endDate: '2025-09-09',
    predecessors: [
      {
        id: 'rel-4',
        predecessorId: 'task-1',
        type: 'FS',
        lag: 0,
        predecessorName: 'Project Planning Phase',
        predecessorWbs: '1'
      }
    ],
    budget: 45000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 2 - Frontend
  {
    id: 'task-10',
    wbsId: 'wbs-2-1',
    wbsPath: '2.1',
    name: 'Frontend Development',
    duration: 20,
    startDate: '2025-07-29',
    endDate: '2025-08-25',
    predecessors: [],
    budget: 25000,
    percentComplete: 0,
    projectId: 'test-project'
  },
  // Level 3 - Components
  {
    id: 'task-11',
    wbsId: 'wbs-2-1-1',
    wbsPath: '2.1.1',
    name: 'Component Development',
    duration: 15,
    startDate: '2025-07-29',
    endDate: '2025-08-18',
    predecessors: [],
    budget: 18000,
    percentComplete: 0,
    projectId: 'test-project'
  }
]

// Helper functions for localStorage persistence
const getStorageKey = (projectId: string, type: 'wbs' | 'tasks') => `schedule-${projectId}-${type}`

const loadFromStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

const saveToStorage = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to save to localStorage:', error)
  }
}

const getMockData = (projectId: string): ScheduleData => {
  const wbsKey = getStorageKey(projectId, 'wbs')
  const tasksKey = getStorageKey(projectId, 'tasks')
  
  return {
    wbsTree: loadFromStorage(wbsKey, initialWbsTree),
    tasks: loadFromStorage(tasksKey, initialTasks)
  }
}

const saveMockData = (projectId: string, data: Partial<ScheduleData>): void => {
  if (data.wbsTree) {
    saveToStorage(getStorageKey(projectId, 'wbs'), data.wbsTree)
  }
  if (data.tasks) {
    saveToStorage(getStorageKey(projectId, 'tasks'), data.tasks)
  }
}

export const scheduleApi = {
  async getSchedule(projectId: string): Promise<ScheduleData> {
    // In production, this would be:
    // const response = await api.get(`/projects/${projectId}/schedule`)
    // return response.data
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(getMockData(projectId))
      }, 100)
    })
  },

  async createWbsNode(projectId: string, node: Partial<WbsNode>): Promise<WbsNode> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const data = getMockData(projectId)
        
        // Validate WBS hierarchy rules
        if (node.parentId) {
          const parent = this.findWbsNodeInTree(data.wbsTree, node.parentId)
          if (!parent) {
            reject(new Error('Parent WBS node not found'))
            return
          }
          
          const expectedLevel = parent.level + 1
          if (node.level && node.level !== expectedLevel) {
            reject(new Error(`Invalid WBS level. Child of level ${parent.level} must be level ${expectedLevel}, but level ${node.level} was specified.`))
            return
          }
          
          // Check if required parent level exists
          if (expectedLevel > 1) {
            const hasRequiredLevel = this.hasWbsLevel(data.wbsTree, expectedLevel - 1)
            if (!hasRequiredLevel) {
              reject(new Error(`Cannot create level ${expectedLevel} WBS item. You must first create a level ${expectedLevel - 1} item.`))
              return
            }
          }
        } else {
          // Root level node
          if (node.level && node.level !== 1) {
            reject(new Error('Root WBS items must be level 1'))
            return
          }
        }
        
        const newNode: WbsNode = {
          id: `wbs-${Date.now()}`,
          code: node.code || '1',
          name: node.name || 'New WBS Item',
          level: node.level || (node.parentId ? this.findWbsNodeInTree(data.wbsTree, node.parentId)!.level + 1 : 1),
          children: [],
          ...node
        }
        
        // Add to tree structure
        if (node.parentId) {
          const addToParent = (nodes: WbsNode[]): boolean => {
            for (const n of nodes) {
              if (n.id === node.parentId) {
                n.children.push(newNode)
                return true
              }
              if (addToParent(n.children)) return true
            }
            return false
          }
          addToParent(data.wbsTree)
        } else {
          data.wbsTree.push(newNode)
        }
        
        // Create a corresponding task for this WBS node
        const newTask: Task = {
          id: `task-${Date.now()}`,
          wbsId: newNode.id,
          wbsPath: newNode.code,
          name: newNode.name,
          duration: 1,
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          predecessors: [],
          budget: 0,
          percentComplete: 0,
          projectId
        }
        
        data.tasks.push(newTask)
        
        saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
        resolve(newNode)
      }, 100)
    })
  },

  // Helper method to find a WBS node in the tree
  findWbsNodeInTree(nodes: WbsNode[], nodeId: string): WbsNode | null {
    for (const node of nodes) {
      if (node.id === nodeId) return node
      if (node.children) {
        const found = this.findWbsNodeInTree(node.children, nodeId)
        if (found) return found
      }
    }
    return null
  },

  // Helper method to check if a WBS level exists in the tree
  hasWbsLevel(nodes: WbsNode[], level: number): boolean {
    for (const node of nodes) {
      if (node.level === level) return true
      if (node.children && this.hasWbsLevel(node.children, level)) return true
    }
    return false
  },

  async updateWbsNode(projectId: string, nodeId: string, updates: Partial<WbsNode>): Promise<WbsNode> {
    return new Promise(resolve => {
      setTimeout(() => {
        const data = getMockData(projectId)
        
        const updateNode = (nodes: WbsNode[]): WbsNode | null => {
          for (const node of nodes) {
            if (node.id === nodeId) {
              Object.assign(node, updates)
              return node
            }
            const found = updateNode(node.children)
            if (found) return found
          }
          return null
        }
        
        const updatedNode = updateNode(data.wbsTree)
        if (updatedNode) {
          // Update corresponding task if name changed
          if (updates.name) {
            const correspondingTask = data.tasks.find(t => t.wbsId === nodeId)
            if (correspondingTask) {
              correspondingTask.name = updates.name
            }
          }
          
          saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
          resolve(updatedNode)
        } else {
          resolve({
            id: nodeId,
            code: '1',
            name: 'Updated WBS Item',
            level: 1,
            children: [],
            ...updates
          })
        }
      }, 100)
    })
  },

  async deleteWbsNode(projectId: string, nodeId: string): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        const data = getMockData(projectId)
        
        // Find the WBS node to get its path before deletion
        const nodeToDelete = this.findWbsNodeInTree(data.wbsTree, nodeId)
        if (!nodeToDelete) {
          resolve()
          return
        }
        
        // Remove all tasks that belong to this WBS node or its children
        const wbsPath = nodeToDelete.code
        data.tasks = data.tasks.filter(task => {
          // Keep tasks that don't match this WBS path or its children
          return task.wbsPath !== wbsPath && !task.wbsPath.startsWith(wbsPath + '.')
        })
        
        const deleteNode = (nodes: WbsNode[], parentNodes?: WbsNode[]): boolean => {
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) {
              nodes.splice(i, 1)
              return true
            }
            if (deleteNode(nodes[i].children, nodes)) return true
          }
          return false
        }
        
        deleteNode(data.wbsTree)
        saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
        resolve()
      }, 100)
    })
  },

  async createTask(projectId: string, task: Partial<Task>): Promise<Task> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const data = getMockData(projectId)
        
        // Validate WBS hierarchy for task creation
        if (task.wbsPath) {
          const level = task.wbsPath.split('.').length
          
          // Check if required parent levels exist
          if (level > 1) {
            const hasRequiredLevel = data.tasks.some(t => {
              const taskLevel = t.wbsPath.split('.').length
              return taskLevel === level - 1
            })
            
            if (!hasRequiredLevel) {
              reject(new Error(`Cannot create level ${level} task. You must first create a level ${level - 1} task.`))
              return
            }
          }
          
          // Validate WBS path format
          const wbsParts = task.wbsPath.split('.')
          for (let i = 0; i < wbsParts.length; i++) {
            const currentLevel = i + 1
            const parentPath = wbsParts.slice(0, i).join('.')
            
            if (currentLevel > 1) {
              const parentExists = data.tasks.some(t => t.wbsPath === parentPath)
              if (!parentExists) {
                reject(new Error(`Parent WBS path "${parentPath}" does not exist. Cannot create "${task.wbsPath}".`))
                return
              }
            }
          }
        }
        
        const newTask: Task = {
          id: `task-${Date.now()}`,
          wbsId: task.wbsId || data.wbsTree[0]?.id || 'wbs-1',
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
        
        // Create or update corresponding WBS node
        this.syncWbsNodeForTask(data, newTask)
        
        data.tasks.push(newTask)
        saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
        resolve(newTask)
      }, 100)
    })
  },

  // Helper method to sync WBS nodes when tasks are created/updated
  syncWbsNodeForTask(data: ScheduleData, task: Task): void {
    const wbsPath = task.wbsPath
    const pathParts = wbsPath.split('.')
    
    // Ensure all parent WBS nodes exist
    for (let i = 0; i < pathParts.length; i++) {
      const currentPath = pathParts.slice(0, i + 1).join('.')
      const level = i + 1
      
      // Check if WBS node already exists
      const existingNode = this.findWbsNodeByPath(data.wbsTree, currentPath)
      if (!existingNode) {
        // Create missing WBS node
        const parentPath = i > 0 ? pathParts.slice(0, i).join('.') : null
        const parentNode = parentPath ? this.findWbsNodeByPath(data.wbsTree, parentPath) : null
        
        const newWbsNode: WbsNode = {
          id: `wbs-${currentPath}-${Date.now()}`,
          code: currentPath,
          name: i === pathParts.length - 1 ? task.name : `WBS ${currentPath}`,
          level,
          children: [],
          parentId: parentNode?.id
        }
        
        if (parentNode) {
          parentNode.children.push(newWbsNode)
        } else {
          data.wbsTree.push(newWbsNode)
        }
        
        // Update task's wbsId to point to the correct node
        if (i === pathParts.length - 1) {
          task.wbsId = newWbsNode.id
        }
      } else if (i === pathParts.length - 1) {
        // Update existing leaf node name to match task
        existingNode.name = task.name
        task.wbsId = existingNode.id
      }
    }
  },

  // Helper method to find WBS node by path
  findWbsNodeByPath(nodes: WbsNode[], path: string): WbsNode | null {
    for (const node of nodes) {
      if (node.code === path) return node
      if (node.children) {
        const found = this.findWbsNodeByPath(node.children, path)
        if (found) return found
      }
    }
    return null
  },

  async updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    return new Promise(resolve => {
      setTimeout(() => {
        const data = getMockData(projectId)
        const taskIndex = data.tasks.findIndex(t => t.id === taskId)
        
        if (taskIndex !== -1) {
          const oldTask = { ...data.tasks[taskIndex] }
          Object.assign(data.tasks[taskIndex], updates)
          
          // If name or wbsPath changed, sync WBS nodes
          if (updates.name || updates.wbsPath) {
            this.syncWbsNodeForTask(data, data.tasks[taskIndex])
            
            // If wbsPath changed, clean up old WBS nodes
            if (updates.wbsPath && oldTask.wbsPath !== updates.wbsPath) {
              this.cleanupOrphanedWbsNodes(data, oldTask.wbsPath)
            }
          }
          
          saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
          resolve(data.tasks[taskIndex])
        } else {
          resolve({
            id: taskId,
            wbsId: 'wbs-1',
            wbsPath: '1',
            name: 'Updated Task',
            duration: 1,
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            predecessors: [],
            budget: 0,
            percentComplete: 0,
            projectId,
            ...updates
          })
        }
      }, 100)
    })
  },

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        const data = getMockData(projectId)
        const taskIndex = data.tasks.findIndex(t => t.id === taskId)
        
        if (taskIndex !== -1) {
          const deletedTask = data.tasks[taskIndex]
          data.tasks.splice(taskIndex, 1)
          
          // Clean up WBS nodes that no longer have tasks
          this.cleanupOrphanedWbsNodes(data, deletedTask.wbsPath)
          
          saveMockData(projectId, { wbsTree: data.wbsTree, tasks: data.tasks })
        }
        
        resolve()
      }, 100)
    })
  },

  // Helper method to clean up WBS nodes that no longer have tasks
  cleanupOrphanedWbsNodes(data: ScheduleData, deletedWbsPath: string): void {
    const pathParts = deletedWbsPath.split('.')
    
    // Check each level from the deepest to the root
    for (let i = pathParts.length - 1; i >= 0; i--) {
      const currentPath = pathParts.slice(0, i + 1).join('.')
      
      // Check if any tasks still use this WBS path
      const hasRemainingTasks = data.tasks.some(t => t.wbsPath === currentPath)
      
      // Check if any tasks use this as a parent path
      const hasChildTasks = data.tasks.some(t => t.wbsPath.startsWith(currentPath + '.'))
      
      // If no tasks use this path and no child tasks exist, remove the WBS node
      if (!hasRemainingTasks && !hasChildTasks) {
        const nodeToDelete = this.findWbsNodeByPath(data.wbsTree, currentPath)
        if (nodeToDelete) {
          this.removeWbsNodeFromTree(data.wbsTree, nodeToDelete.id)
        }
      } else {
        // If this level has tasks/children, stop cleanup (parent levels are still needed)
        break
      }
    }
  },

  // Helper method to remove a WBS node from the tree
  removeWbsNodeFromTree(nodes: WbsNode[], nodeId: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === nodeId) {
        nodes.splice(i, 1)
        return true
      }
      if (this.removeWbsNodeFromTree(nodes[i].children, nodeId)) {
        return true
      }
    }
    return false
  }
} 