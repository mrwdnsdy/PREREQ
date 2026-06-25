import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTasks } from './useTasks'

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))

import api from '../services/api'

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const backendTask = {
  id: 't1',
  activityId: 'A1',
  title: 'Task 1',
  wbsCode: '1.1',
  startDate: '2025-01-01',
  endDate: '2025-01-05',
  isMilestone: false,
  costLabor: '100', // Decimal serialized as string
  costMaterial: 50, // plain number
  costOther: { toString: () => '25' }, // Decimal-like object
  totalCost: '175',
  level: 2,
  projectId: 'p1',
  predecessors: [],
  successors: [],
  children: [{ id: 'child' }], // non-empty → header row
  createdAt: '',
  updatedAt: '',
}

describe('useTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and transforms backend tasks into the frontend shape', async () => {
    ;(api.get as Mock).mockResolvedValue({ data: [backendTask] })

    const { result } = renderHook(() => useTasks('p1'), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.tasks).toBeDefined())

    expect(api.get).toHaveBeenCalledWith('/tasks/project/p1')
    const task = result.current.tasks![0]
    expect(task).toMatchObject({
      id: 't1',
      name: 'Task 1',
      wbsCode: '1.1',
      level: 2,
      isMilestone: false,
      isHeader: true, // derived from having children
    })
    // duration = ceil((end-start)/day) + 1, clamped to >= 1
    expect(task.duration).toBe(5)
    // budget sums the three cost components regardless of number/string/Decimal form
    expect(task.budget).toBe(175)
    // totalCost uses the backend's rolled-up value
    expect(task.totalCost).toBe(175)
  })

  it('does not fetch when projectId is empty', async () => {
    const { result } = renderHook(() => useTasks(''), { wrapper: createWrapper() })
    // query is disabled (enabled: !!projectId)
    expect(result.current.tasks).toBeUndefined()
    expect(api.get).not.toHaveBeenCalled()
  })
})
