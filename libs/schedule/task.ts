export interface Task {
  id: string
  name: string
  duration: number // in days
  startDate: Date
  endDate: Date
  earliestStart?: Date
  latestStart?: Date
  earliestFinish?: Date
  latestFinish?: Date
  isCritical?: boolean
  predecessors: TaskDependency[]
  successors: TaskDependency[]
}

export interface TaskDependency {
  id: string
  predecessorId: string
  successorId: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lag: number // in days, can be positive or negative
}

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'

// Helper function to calculate the earliest start time based on a dependency
export function calculateEarliestStart(
  task: Task,
  predecessor: Task,
  dependency: TaskDependency
): Date {
  const predFinish = new Date(predecessor.earliestFinish || predecessor.endDate)
  const predStart = new Date(predecessor.earliestStart || predecessor.startDate)
  
  switch (dependency.type) {
    case 'FS': // Finish-to-Start
      // Successor can start after predecessor finishes + lag
      return new Date(predFinish.getTime() + dependency.lag * 24 * 60 * 60 * 1000)
    
    case 'SS': // Start-to-Start
      // Successor can start after predecessor starts + lag
      return new Date(predStart.getTime() + dependency.lag * 24 * 60 * 60 * 1000)
    
    case 'FF': // Finish-to-Finish
      // Successor must finish after predecessor finishes + lag
      // So successor start = predecessor finish + lag - successor duration
      const successorDuration = (task.duration - 1) * 24 * 60 * 60 * 1000
      return new Date(predFinish.getTime() + dependency.lag * 24 * 60 * 60 * 1000 - successorDuration)
    
    case 'SF': // Start-to-Finish
      // Successor must finish after predecessor starts + lag
      // So successor start = predecessor start + lag - successor duration
      const successorDuration2 = (task.duration - 1) * 24 * 60 * 60 * 1000
      return new Date(predStart.getTime() + dependency.lag * 24 * 60 * 60 * 1000 - successorDuration2)
    
    default:
      throw new Error(`Unknown dependency type: ${dependency.type}`)
  }
}

// Helper function to calculate the latest finish time based on a dependency
export function calculateLatestFinish(
  task: Task,
  successor: Task,
  dependency: TaskDependency
): Date {
  const succStart = new Date(successor.latestStart || successor.startDate)
  const succFinish = new Date(successor.latestFinish || successor.endDate)
  
  switch (dependency.type) {
    case 'FS': // Finish-to-Start
      // Predecessor must finish before successor starts - lag
      return new Date(succStart.getTime() - dependency.lag * 24 * 60 * 60 * 1000)
    
    case 'SS': // Start-to-Start
      // Predecessor must start before successor starts - lag
      return new Date(succStart.getTime() - dependency.lag * 24 * 60 * 60 * 1000 + (task.duration - 1) * 24 * 60 * 60 * 1000)
    
    case 'FF': // Finish-to-Finish
      // Predecessor must finish before successor finishes - lag
      return new Date(succFinish.getTime() - dependency.lag * 24 * 60 * 60 * 1000)
    
    case 'SF': // Start-to-Finish
      // Predecessor must start before successor finishes - lag
      return new Date(succFinish.getTime() - dependency.lag * 24 * 60 * 60 * 1000 + (task.duration - 1) * 24 * 60 * 60 * 1000)
    
    default:
      throw new Error(`Unknown dependency type: ${dependency.type}`)
  }
} 