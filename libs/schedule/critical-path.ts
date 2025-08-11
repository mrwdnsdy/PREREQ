import { Task, TaskDependency, calculateEarliestStart, calculateLatestFinish } from './task'

/**
 * Performs forward pass to calculate earliest start and finish times
 * @param tasks Array of tasks with their dependencies
 * @returns Tasks with earliestStart and earliestFinish populated
 */
export function forwardPass(tasks: Task[]): Task[] {
  // Create a map for quick task lookup
  const taskMap = new Map<string, Task>()
  tasks.forEach(task => {
    taskMap.set(task.id, { ...task })
  })

  // Set up successor relationships
  tasks.forEach(task => {
    task.predecessors.forEach(dep => {
      const predecessor = taskMap.get(dep.predecessorId)
      if (predecessor) {
        if (!predecessor.successors) {
          predecessor.successors = []
        }
        predecessor.successors.push(dep)
      }
    })
  })

  // Find tasks with no predecessors (start tasks)
  const startTasks = tasks.filter(task => task.predecessors.length === 0)
  
  // Initialize start tasks with their original start dates
  startTasks.forEach(task => {
    const taskCopy = taskMap.get(task.id)!
    taskCopy.earliestStart = new Date(task.startDate)
    taskCopy.earliestFinish = new Date(task.startDate)
    taskCopy.earliestFinish.setDate(taskCopy.earliestFinish.getDate() + task.duration - 1)
  })

  // Process tasks in topological order
  const processed = new Set<string>()
  const queue = [...startTasks.map(t => t.id)]

  while (queue.length > 0) {
    const taskId = queue.shift()!
    if (processed.has(taskId)) continue

    const task = taskMap.get(taskId)!
    processed.add(taskId)

    // Calculate earliest start based on all predecessors
    let maxEarliestStart = new Date(task.startDate)
    
    for (const dep of task.predecessors) {
      const predecessor = taskMap.get(dep.predecessorId)
      if (!predecessor) continue

      const earliestStart = calculateEarliestStart(task, predecessor, dep)
      if (earliestStart > maxEarliestStart) {
        maxEarliestStart = earliestStart
      }
    }

    // Update task with calculated times
    task.earliestStart = maxEarliestStart
    task.earliestFinish = new Date(maxEarliestStart)
    task.earliestFinish.setDate(task.earliestFinish.getDate() + task.duration - 1)

    // Add successors to queue
    for (const dep of task.successors) {
      const successor = taskMap.get(dep.successorId)
      if (!successor) continue

      // Check if all predecessors of successor have been processed
      const allPredecessorsProcessed = successor.predecessors.every(pred => 
        processed.has(pred.predecessorId)
      )

      if (allPredecessorsProcessed && !queue.includes(dep.successorId)) {
        queue.push(dep.successorId)
      }
    }
  }

  return Array.from(taskMap.values())
}

/**
 * Performs backward pass to calculate latest start and finish times
 * @param tasks Array of tasks with earliest times calculated
 * @returns Tasks with latestStart and latestFinish populated
 */
export function backwardPass(tasks: Task[]): Task[] {
  // Create a map for quick task lookup
  const taskMap = new Map<string, Task>()
  tasks.forEach(task => {
    taskMap.set(task.id, { ...task })
  })

  // Find tasks with no successors (end tasks)
  const endTasks = tasks.filter(task => task.successors.length === 0)
  
  // Find the project end date (maximum earliest finish time)
  const projectEndDate = new Date(Math.max(...tasks.map(t => 
    (t.earliestFinish || t.endDate).getTime()
  )))

  // Initialize end tasks with project end date
  endTasks.forEach(task => {
    const taskCopy = taskMap.get(task.id)!
    taskCopy.latestFinish = new Date(projectEndDate)
    taskCopy.latestStart = new Date(projectEndDate)
    taskCopy.latestStart.setDate(taskCopy.latestStart.getDate() - task.duration + 1)
  })

  // Process tasks in reverse topological order
  const processed = new Set<string>()
  const queue = [...endTasks.map(t => t.id)]

  while (queue.length > 0) {
    const taskId = queue.shift()!
    if (processed.has(taskId)) continue

    const task = taskMap.get(taskId)!
    processed.add(taskId)

    // Calculate latest finish based on all successors
    let minLatestFinish = new Date(task.latestFinish || task.endDate)
    
    // If task has no successors, use project end date
    if (task.successors.length === 0) {
      minLatestFinish = new Date(projectEndDate)
    } else {
      for (const dep of task.successors) {
        const successor = taskMap.get(dep.successorId)
        if (!successor) continue

        const latestFinish = calculateLatestFinish(task, successor, dep)
        if (latestFinish < minLatestFinish) {
          minLatestFinish = latestFinish
        }
      }
    }

    // Update task with calculated times
    task.latestFinish = minLatestFinish
    task.latestStart = new Date(minLatestFinish)
    task.latestStart.setDate(task.latestStart.getDate() - task.duration + 1)

    // Add predecessors to queue
    for (const dep of task.predecessors) {
      const predecessor = taskMap.get(dep.predecessorId)
      if (!predecessor) continue

      // Check if all successors of predecessor have been processed
      const allSuccessorsProcessed = predecessor.successors.every(succ => 
        processed.has(succ.successorId)
      )

      if (allSuccessorsProcessed && !queue.includes(dep.predecessorId)) {
        queue.push(dep.predecessorId)
      }
    }
  }

  return Array.from(taskMap.values())
}

/**
 * Calculates the critical path and marks critical tasks
 * @param tasks Array of tasks with earliest and latest times calculated
 * @returns Tasks with isCritical flag populated
 */
export function calculateCriticalPath(tasks: Task[]): Task[] {
  return tasks.map(task => {
    const isCritical = (
      task.earliestStart?.getTime() === task.latestStart?.getTime() &&
      task.earliestFinish?.getTime() === task.latestFinish?.getTime()
    )
    
    return {
      ...task,
      isCritical: isCritical || false
    }
  })
}

/**
 * Performs complete critical path analysis
 * @param tasks Array of tasks with dependencies
 * @returns Tasks with all CPM times and critical path flags
 */
export function performCriticalPathAnalysis(tasks: Task[]): Task[] {
  // Forward pass to calculate earliest times
  const tasksWithEarliest = forwardPass(tasks)
  
  // Backward pass to calculate latest times
  const tasksWithLatest = backwardPass(tasksWithEarliest)
  
  // Calculate critical path
  const tasksWithCritical = calculateCriticalPath(tasksWithLatest)
  
  return tasksWithCritical
} 