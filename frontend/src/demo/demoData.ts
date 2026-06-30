// In-memory demo backend data.
//
// Seeds the same sample project the visual-test fixtures use, but lives under
// `src/` so it ships with the app bundle. The store is MUTABLE: the demo axios
// adapter (`demoAdapter.ts`) reads and writes it so the live, backend-less Pages
// build feels real (create/edit/link/delete all persist for the session and
// reset on refresh). Shapes mirror the backend contracts in
// `src/hooks/useTasks.ts`, `src/services/resourcesApi.ts`,
// `src/services/dependenciesApi.ts`, and the page components.

export const PROJECT_ID = 'proj-1'

export interface DemoTask {
  id: string
  activityId: string
  title: string
  wbsCode: string
  startDate: string
  endDate: string
  isMilestone: boolean
  costLabor: number
  costMaterial: number
  costOther: number
  totalCost: number
  level: number
  projectId: string
  parentId?: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface DemoDependency {
  id: string
  predecessorId: string
  successorId: string
  type: string
  lag: number
  createdAt: string
  updatedAt: string
}

export interface DemoStore {
  authProfile: { id: string; email: string; fullName: string }
  projects: Array<Record<string, unknown>>
  tasks: DemoTask[]
  dependencies: DemoDependency[]
  resourceTypes: Array<Record<string, unknown>>
  resources: Array<Record<string, unknown>>
  assignments: Array<Record<string, unknown>>
  // Monotonic counters for generated ids (no Date.now / Math.random needed).
  seq: { task: number; dep: number; project: number; resource: number; assignment: number }
}

const NOW = '2025-06-01T00:00:00Z'

function seed(): DemoStore {
  const resourceTypes = [
    { id: 'rt-1', name: 'Labour', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
    { id: 'rt-2', name: 'Equipment', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
    { id: 'rt-3', name: 'Material', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  ]
  const resources = [
    { id: 'r-1', name: 'Senior Engineer', rateFloat: 185, typeId: 'rt-1', createdAt: NOW, updatedAt: NOW, type: resourceTypes[0] },
    { id: 'r-2', name: 'Project Manager', rateFloat: 160, typeId: 'rt-1', createdAt: NOW, updatedAt: NOW, type: resourceTypes[0] },
    { id: 'r-3', name: 'Excavator', rateFloat: 220, typeId: 'rt-2', createdAt: NOW, updatedAt: NOW, type: resourceTypes[1] },
  ]
  return {
    authProfile: { id: 'user-1', email: 'demo@prereq.com', fullName: 'Demo User' },
    projects: [
      {
        id: 'proj-1', name: 'Enterprise Software Implementation', client: 'Tech Solutions Inc.',
        description: 'Full-cycle delivery of the enterprise platform across planning, build, and rollout.',
        status: 'IN_PROGRESS', startDate: '2025-07-01', endDate: '2025-12-19', budget: 2500000,
      },
      {
        id: 'proj-2', name: 'Warehouse Automation Rollout', client: 'LogiCorp',
        description: 'Robotics and conveyor automation across three distribution centers.',
        status: 'PLANNING', startDate: '2025-09-01', endDate: '2026-04-30', budget: 1800000,
      },
      {
        id: 'proj-3', name: 'Data Center Migration', client: 'FinServe',
        description: 'Lift-and-shift of legacy workloads to the new region with zero-downtime cutover.',
        status: 'COMPLETED', startDate: '2025-01-15', endDate: '2025-06-30', budget: 950000,
      },
    ],
    tasks: [
      { id: 't1', activityId: 'A1000', title: 'Project Planning', wbsCode: '1', startDate: '2025-07-01', endDate: '2025-07-28', isMilestone: false, costLabor: 80000, costMaterial: 5000, costOther: 2000, totalCost: 87000, level: 1, projectId: PROJECT_ID, description: 'Planning phase', createdAt: NOW, updatedAt: NOW },
      { id: 't2', activityId: 'A1100', title: 'Requirements Gathering', wbsCode: '1.1', startDate: '2025-07-01', endDate: '2025-07-10', isMilestone: false, costLabor: 30000, costMaterial: 0, costOther: 0, totalCost: 30000, level: 2, projectId: PROJECT_ID, parentId: 't1', createdAt: NOW, updatedAt: NOW },
      { id: 't3', activityId: 'A1110', title: 'Stakeholder Interviews', wbsCode: '1.1.1', startDate: '2025-07-01', endDate: '2025-07-03', isMilestone: false, costLabor: 12000, costMaterial: 0, costOther: 0, totalCost: 12000, level: 3, projectId: PROJECT_ID, parentId: 't2', createdAt: NOW, updatedAt: NOW },
      { id: 't4', activityId: 'A1200', title: 'Design Phase', wbsCode: '1.2', startDate: '2025-07-11', endDate: '2025-07-28', isMilestone: false, costLabor: 38000, costMaterial: 5000, costOther: 2000, totalCost: 45000, level: 2, projectId: PROJECT_ID, parentId: 't1', createdAt: NOW, updatedAt: NOW },
      { id: 't5', activityId: 'A2000', title: 'Development', wbsCode: '2', startDate: '2025-07-29', endDate: '2025-10-31', isMilestone: false, costLabor: 1100000, costMaterial: 40000, costOther: 10000, totalCost: 1150000, level: 1, projectId: PROJECT_ID, createdAt: NOW, updatedAt: NOW },
      { id: 't6', activityId: 'A2100', title: 'Frontend Development', wbsCode: '2.1', startDate: '2025-07-29', endDate: '2025-09-15', isMilestone: false, costLabor: 600000, costMaterial: 0, costOther: 0, totalCost: 600000, level: 2, projectId: PROJECT_ID, parentId: 't5', createdAt: NOW, updatedAt: NOW },
      { id: 't7', activityId: 'A2200', title: 'Backend Development', wbsCode: '2.2', startDate: '2025-07-29', endDate: '2025-10-31', isMilestone: false, costLabor: 500000, costMaterial: 40000, costOther: 10000, totalCost: 550000, level: 2, projectId: PROJECT_ID, parentId: 't5', createdAt: NOW, updatedAt: NOW },
      { id: 't8', activityId: 'M3000', title: 'Go-Live', wbsCode: '3', startDate: '2025-12-19', endDate: '2025-12-19', isMilestone: true, costLabor: 0, costMaterial: 0, costOther: 0, totalCost: 0, level: 1, projectId: PROJECT_ID, createdAt: NOW, updatedAt: NOW },
    ],
    dependencies: [
      { id: 'd1', predecessorId: 't3', successorId: 't4', type: 'FS', lag: 0, createdAt: NOW, updatedAt: NOW },
      { id: 'd2', predecessorId: 't4', successorId: 't6', type: 'FS', lag: 2, createdAt: NOW, updatedAt: NOW },
      { id: 'd3', predecessorId: 't4', successorId: 't7', type: 'FS', lag: 0, createdAt: NOW, updatedAt: NOW },
      { id: 'd4', predecessorId: 't6', successorId: 't8', type: 'FS', lag: 0, createdAt: NOW, updatedAt: NOW },
      { id: 'd5', predecessorId: 't7', successorId: 't8', type: 'SS', lag: 1, createdAt: NOW, updatedAt: NOW },
    ],
    resourceTypes,
    resources,
    assignments: [
      { id: 'a-1', taskId: 't6', resourceId: 'r-1', hours: 320, createdAt: NOW, updatedAt: NOW, resource: resources[0], task: { id: 't6', title: 'Frontend Development', activityId: 'A2100', wbsCode: '2.1' } },
    ],
    seq: { task: 100, dep: 100, project: 100, resource: 100, assignment: 100 },
  }
}

// The single live store. `resetStore` lets us re-seed (not used by the UI yet,
// but handy for tests/manual resets).
export let store: DemoStore = seed()

export function resetStore(): void {
  store = seed()
}
