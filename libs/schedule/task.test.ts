import { Task, TaskDependency, calculateEarliestStart, calculateLatestFinish } from './task'
import { forwardPass, backwardPass, calculateCriticalPath, performCriticalPathAnalysis } from './critical-path'

describe('Task and Dependency Models', () => {
  describe('calculateEarliestStart', () => {
    it('should calculate FS +3d lag correctly', () => {
      const predecessor: Task = {
        id: 'task1',
        name: 'Task 1',
        duration: 5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        earliestStart: new Date('2024-01-01'),
        earliestFinish: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const successor: Task = {
        id: 'task2',
        name: 'Task 2',
        duration: 3,
        startDate: new Date('2024-01-06'),
        endDate: new Date('2024-01-08'),
        predecessors: [],
        successors: []
      }

      const dependency: TaskDependency = {
        id: 'dep1',
        predecessorId: 'task1',
        successorId: 'task2',
        type: 'FS',
        lag: 3
      }

      const result = calculateEarliestStart(successor, predecessor, dependency)
      expect(result).toEqual(new Date('2024-01-08')) // 2024-01-05 + 3 days
    })

    it('should calculate SS -2d lag correctly', () => {
      const predecessor: Task = {
        id: 'task1',
        name: 'Task 1',
        duration: 5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        earliestStart: new Date('2024-01-01'),
        earliestFinish: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const successor: Task = {
        id: 'task2',
        name: 'Task 2',
        duration: 3,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-03'),
        predecessors: [],
        successors: []
      }

      const dependency: TaskDependency = {
        id: 'dep1',
        predecessorId: 'task1',
        successorId: 'task2',
        type: 'SS',
        lag: -2
      }

      const result = calculateEarliestStart(successor, predecessor, dependency)
      expect(result).toEqual(new Date('2023-12-30')) // 2024-01-01 - 2 days
    })

    it('should calculate FF +0d lag correctly', () => {
      const predecessor: Task = {
        id: 'task1',
        name: 'Task 1',
        duration: 5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        earliestStart: new Date('2024-01-01'),
        earliestFinish: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const successor: Task = {
        id: 'task2',
        name: 'Task 2',
        duration: 3,
        startDate: new Date('2024-01-03'),
        endDate: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const dependency: TaskDependency = {
        id: 'dep1',
        predecessorId: 'task1',
        successorId: 'task2',
        type: 'FF',
        lag: 0
      }

      const result = calculateEarliestStart(successor, predecessor, dependency)
      expect(result).toEqual(new Date('2024-01-03')) // 2024-01-05 + 0 - 2 days (duration-1)
    })

    it('should calculate SF +5d lag correctly', () => {
      const predecessor: Task = {
        id: 'task1',
        name: 'Task 1',
        duration: 5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        earliestStart: new Date('2024-01-01'),
        earliestFinish: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const successor: Task = {
        id: 'task2',
        name: 'Task 2',
        duration: 3,
        startDate: new Date('2024-01-03'),
        endDate: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const dependency: TaskDependency = {
        id: 'dep1',
        predecessorId: 'task1',
        successorId: 'task2',
        type: 'SF',
        lag: 5
      }

      const result = calculateEarliestStart(successor, predecessor, dependency)
      expect(result).toEqual(new Date('2024-01-04')) // 2024-01-01 + 5 - 2 days (duration-1)
    })
  })

  describe('calculateLatestFinish', () => {
    it('should calculate FS +3d lag correctly for latest finish', () => {
      const predecessor: Task = {
        id: 'task1',
        name: 'Task 1',
        duration: 5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-05'),
        predecessors: [],
        successors: []
      }

      const successor: Task = {
        id: 'task2',
        name: 'Task 2',
        duration: 3,
        startDate: new Date('2024-01-08'),
        endDate: new Date('2024-01-10'),
        latestStart: new Date('2024-01-08'),
        latestFinish: new Date('2024-01-10'),
        predecessors: [],
        successors: []
      }

      const dependency: TaskDependency = {
        id: 'dep1',
        predecessorId: 'task1',
        successorId: 'task2',
        type: 'FS',
        lag: 3
      }

      const result = calculateLatestFinish(predecessor, successor, dependency)
      expect(result).toEqual(new Date('2024-01-05')) // 2024-01-08 - 3 days
    })
  })
})

describe('Critical Path Analysis', () => {
  describe('forwardPass', () => {
    it('should calculate earliest times for a simple chain', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 0
          }],
          successors: []
        }
      ]

      const result = forwardPass(tasks)
      
      expect(result[0].earliestStart).toEqual(new Date('2024-01-01'))
      expect(result[0].earliestFinish).toEqual(new Date('2024-01-05'))
      expect(result[1].earliestStart).toEqual(new Date('2024-01-06'))
      expect(result[1].earliestFinish).toEqual(new Date('2024-01-08'))
    })

    it('should handle FS +3d lag in forward pass', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 3
          }],
          successors: []
        }
      ]

      const result = forwardPass(tasks)
      
      expect(result[0].earliestStart).toEqual(new Date('2024-01-01'))
      expect(result[0].earliestFinish).toEqual(new Date('2024-01-05'))
      expect(result[1].earliestStart).toEqual(new Date('2024-01-08')) // 2024-01-05 + 3 days
      expect(result[1].earliestFinish).toEqual(new Date('2024-01-10'))
    })
  })

  describe('backwardPass', () => {
    it('should calculate latest times for a simple chain', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          earliestStart: new Date('2024-01-01'),
          earliestFinish: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          earliestStart: new Date('2024-01-06'),
          earliestFinish: new Date('2024-01-08'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 0
          }],
          successors: []
        }
      ]

      const result = backwardPass(tasks)
      
      expect(result[1].latestFinish).toEqual(new Date('2024-01-08'))
      expect(result[1].latestStart).toEqual(new Date('2024-01-06'))
      expect(result[0].latestFinish).toEqual(new Date('2024-01-08')) // Project end date since task1 has no successors
      expect(result[0].latestStart).toEqual(new Date('2024-01-04')) // 2024-01-08 - 5 days + 1
    })
  })

  describe('calculateCriticalPath', () => {
    it('should mark critical tasks correctly', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          earliestStart: new Date('2024-01-01'),
          earliestFinish: new Date('2024-01-05'),
          latestStart: new Date('2024-01-01'),
          latestFinish: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          earliestStart: new Date('2024-01-06'),
          earliestFinish: new Date('2024-01-08'),
          latestStart: new Date('2024-01-06'),
          latestFinish: new Date('2024-01-08'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 0
          }],
          successors: []
        }
      ]

      const result = calculateCriticalPath(tasks)
      
      expect(result[0].isCritical).toBe(true)
      expect(result[1].isCritical).toBe(true)
    })

    it('should not mark non-critical tasks', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          earliestStart: new Date('2024-01-01'),
          earliestFinish: new Date('2024-01-05'),
          latestStart: new Date('2024-01-01'),
          latestFinish: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          earliestStart: new Date('2024-01-06'),
          earliestFinish: new Date('2024-01-08'),
          latestStart: new Date('2024-01-03'), // Has float
          latestFinish: new Date('2024-01-05'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 0
          }],
          successors: []
        }
      ]

      const result = calculateCriticalPath(tasks)
      
      expect(result[0].isCritical).toBe(true)
      expect(result[1].isCritical).toBe(false)
    })
  })

  describe('performCriticalPathAnalysis', () => {
    it('should perform complete CPM analysis with lag support', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-08'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'FS',
            lag: 3
          }],
          successors: []
        }
      ]

      const result = performCriticalPathAnalysis(tasks)
      
      // Check earliest times
      expect(result[0].earliestStart).toEqual(new Date('2024-01-01'))
      expect(result[0].earliestFinish).toEqual(new Date('2024-01-05'))
      expect(result[1].earliestStart).toEqual(new Date('2024-01-08')) // +3 days lag
      expect(result[1].earliestFinish).toEqual(new Date('2024-01-10'))
      
      // Check latest times
      expect(result[1].latestFinish).toEqual(new Date('2024-01-10'))
      expect(result[1].latestStart).toEqual(new Date('2024-01-08'))
      expect(result[0].latestFinish).toEqual(new Date('2024-01-05'))
      expect(result[0].latestStart).toEqual(new Date('2024-01-01'))
      
      // Check critical path
      expect(result[0].isCritical).toBe(true)
      expect(result[1].isCritical).toBe(true)
    })

    it('should handle complex network with different lag types', () => {
      const tasks: Task[] = [
        {
          id: 'task1',
          name: 'Task 1',
          duration: 5,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-05'),
          predecessors: [],
          successors: []
        },
        {
          id: 'task2',
          name: 'Task 2',
          duration: 3,
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-03'),
          predecessors: [{
            id: 'dep1',
            predecessorId: 'task1',
            successorId: 'task2',
            type: 'SS',
            lag: -2
          }],
          successors: []
        },
        {
          id: 'task3',
          name: 'Task 3',
          duration: 4,
          startDate: new Date('2024-01-06'),
          endDate: new Date('2024-01-09'),
          predecessors: [{
            id: 'dep2',
            predecessorId: 'task1',
            successorId: 'task3',
            type: 'FF',
            lag: 0
          }],
          successors: []
        },
        {
          id: 'task4',
          name: 'Task 4',
          duration: 2,
          startDate: new Date('2024-01-10'),
          endDate: new Date('2024-01-11'),
          predecessors: [{
            id: 'dep3',
            predecessorId: 'task2',
            successorId: 'task4',
            type: 'SF',
            lag: 5
          }],
          successors: []
        }
      ]

      const result = performCriticalPathAnalysis(tasks)
      
      // Verify all tasks have CPM times calculated
      result.forEach(task => {
        expect(task.earliestStart).toBeDefined()
        expect(task.earliestFinish).toBeDefined()
        expect(task.latestStart).toBeDefined()
        expect(task.latestFinish).toBeDefined()
        expect(task.isCritical).toBeDefined()
      })
    })
  })
}) 