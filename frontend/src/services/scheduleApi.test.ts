import { describe, it, expect, beforeEach, vi } from 'vitest'
import { scheduleApi, type WbsNode } from './scheduleApi'

// scheduleApi imports the axios instance but does not use it for these
// (localStorage-backed) methods; stub it so importing has no side effects.
vi.mock('./api', () => ({ default: {} }))

const node = (id: string, level: number, children: WbsNode[] = []): WbsNode => ({
  id,
  code: id,
  name: id,
  level,
  children,
})

const seed = (projectId: string, tree: WbsNode[], tasks: any[] = []) => {
  localStorage.setItem(`schedule-${projectId}-wbs`, JSON.stringify(tree))
  localStorage.setItem(`schedule-${projectId}-tasks`, JSON.stringify(tasks))
}

describe('scheduleApi tree helpers', () => {
  const tree: WbsNode[] = [node('a', 1, [node('b', 2, [node('c', 3)])]), node('d', 1)]

  it('findWbsNodeInTree finds a deeply nested node', () => {
    expect(scheduleApi.findWbsNodeInTree(tree, 'c')?.id).toBe('c')
  })

  it('findWbsNodeInTree returns null when the node is absent', () => {
    expect(scheduleApi.findWbsNodeInTree(tree, 'zzz')).toBeNull()
  })

  it('hasWbsLevel reports whether any node sits at a given level', () => {
    expect(scheduleApi.hasWbsLevel(tree, 3)).toBe(true)
    expect(scheduleApi.hasWbsLevel(tree, 4)).toBe(false)
  })
})

describe('scheduleApi.createWbsNode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('creates a valid child node and persists it', async () => {
    seed('p1', [node('wbs-1', 1)])

    const created = await scheduleApi.createWbsNode('p1', {
      parentId: 'wbs-1',
      name: 'Requirements',
      level: 2,
    })
    expect(created.level).toBe(2)

    const schedule = await scheduleApi.getSchedule('p1')
    expect(scheduleApi.findWbsNodeInTree(schedule.wbsTree, created.id)).toBeTruthy()
  })

  it('rejects when the parent node does not exist', async () => {
    seed('p1', [node('wbs-1', 1)])
    await expect(
      scheduleApi.createWbsNode('p1', { parentId: 'missing', level: 2 }),
    ).rejects.toThrow('Parent WBS node not found')
  })

  it('rejects a child whose level does not follow its parent', async () => {
    seed('p1', [node('wbs-1', 1)])
    await expect(
      scheduleApi.createWbsNode('p1', { parentId: 'wbs-1', level: 3 }),
    ).rejects.toThrow('Invalid WBS level')
  })

  it('rejects a root node that is not level 1', async () => {
    seed('p1', [node('wbs-1', 1)])
    await expect(scheduleApi.createWbsNode('p1', { level: 2 })).rejects.toThrow(
      'Root WBS items must be level 1',
    )
  })
})
