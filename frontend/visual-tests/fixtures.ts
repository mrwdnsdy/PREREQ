// Fixture data for the visual-test harness. Shapes are derived from the
// frontend's own TS contracts:
//   - BackendTask: src/hooks/useTasks.ts
//   - Resource* :  src/services/resourcesApi.ts
//   - TaskDependency: src/services/dependenciesApi.ts
//   - project fields used by pages: src/pages/{Projects,PortfolioView,ProjectDetail,Dashboard}.tsx
//
// These drive rendering with NO real backend — see mock.ts.

export const PROJECT_ID = 'proj-1'

export const authProfile = {
  id: 'user-1',
  email: 'demo@prereq.com',
  fullName: 'Demo User',
}

export const projects = [
  {
    id: 'proj-1',
    name: 'Enterprise Software Implementation',
    client: 'Tech Solutions Inc.',
    description: 'Full-cycle delivery of the enterprise platform across planning, build, and rollout.',
    status: 'IN_PROGRESS',
    startDate: '2025-07-01',
    endDate: '2025-12-19',
    budget: 2500000,
  },
  {
    id: 'proj-2',
    name: 'Warehouse Automation Rollout',
    client: 'LogiCorp',
    description: 'Robotics and conveyor automation across three distribution centers.',
    status: 'PLANNING',
    startDate: '2025-09-01',
    endDate: '2026-04-30',
    budget: 1800000,
  },
  {
    id: 'proj-3',
    name: 'Data Center Migration',
    client: 'FinServe',
    description: 'Lift-and-shift of legacy workloads to the new region with zero-downtime cutover.',
    status: 'COMPLETED',
    startDate: '2025-01-15',
    endDate: '2025-06-30',
    budget: 950000,
  },
]

export const projectDetail = projects[0]

// Flat array of BackendTask (linked by parentId + level). `children` length is
// only read by the transform to flag headers, so stub arrays are sufficient.
const stub = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `stub-${i}` }))

export const tasks = [
  {
    id: 't1', activityId: 'A1000', title: 'Project Planning', wbsCode: '1',
    startDate: '2025-07-01', endDate: '2025-07-28', isMilestone: false,
    costLabor: 80000, costMaterial: 5000, costOther: 2000, totalCost: 87000,
    level: 1, projectId: PROJECT_ID, description: 'Planning phase',
    predecessors: [], successors: [], children: stub(2),
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't2', activityId: 'A1100', title: 'Requirements Gathering', wbsCode: '1.1',
    startDate: '2025-07-01', endDate: '2025-07-10', isMilestone: false,
    costLabor: 30000, costMaterial: 0, costOther: 0, totalCost: 30000,
    level: 2, projectId: PROJECT_ID, parentId: 't1',
    predecessors: [], successors: [], children: stub(1),
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't3', activityId: 'A1110', title: 'Stakeholder Interviews', wbsCode: '1.1.1',
    startDate: '2025-07-01', endDate: '2025-07-03', isMilestone: false,
    costLabor: 12000, costMaterial: 0, costOther: 0, totalCost: 12000,
    level: 3, projectId: PROJECT_ID, parentId: 't2',
    predecessors: [], successors: [], children: [],
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't4', activityId: 'A1200', title: 'Design Phase', wbsCode: '1.2',
    startDate: '2025-07-11', endDate: '2025-07-28', isMilestone: false,
    costLabor: 38000, costMaterial: 5000, costOther: 2000, totalCost: 45000,
    level: 2, projectId: PROJECT_ID, parentId: 't1',
    predecessors: [
      { id: 'd1', predecessorId: 't3', type: 'FS', lag: 0,
        predecessor: { id: 't3', activityId: 'A1110', title: 'Stakeholder Interviews', wbsCode: '1.1.1' } },
    ],
    successors: [], children: [],
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't5', activityId: 'A2000', title: 'Development', wbsCode: '2',
    startDate: '2025-07-29', endDate: '2025-10-31', isMilestone: false,
    costLabor: 1100000, costMaterial: 40000, costOther: 10000, totalCost: 1150000,
    level: 1, projectId: PROJECT_ID,
    predecessors: [], successors: [], children: stub(2),
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't6', activityId: 'A2100', title: 'Frontend Development', wbsCode: '2.1',
    startDate: '2025-07-29', endDate: '2025-09-15', isMilestone: false,
    costLabor: 600000, costMaterial: 0, costOther: 0, totalCost: 600000,
    level: 2, projectId: PROJECT_ID, parentId: 't5',
    predecessors: [
      { id: 'd2', predecessorId: 't4', type: 'FS', lag: 2,
        predecessor: { id: 't4', activityId: 'A1200', title: 'Design Phase', wbsCode: '1.2' } },
    ],
    successors: [], children: [],
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't7', activityId: 'A2200', title: 'Backend Development', wbsCode: '2.2',
    startDate: '2025-07-29', endDate: '2025-10-31', isMilestone: false,
    costLabor: 500000, costMaterial: 40000, costOther: 10000, totalCost: 550000,
    level: 2, projectId: PROJECT_ID, parentId: 't5',
    predecessors: [], successors: [], children: [],
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 't8', activityId: 'M3000', title: 'Go-Live', wbsCode: '3',
    startDate: '2025-12-19', endDate: '2025-12-19', isMilestone: true,
    costLabor: 0, costMaterial: 0, costOther: 0, totalCost: 0,
    level: 1, projectId: PROJECT_ID,
    predecessors: [], successors: [], children: [],
    createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
  },
]

export const resourceTypes = [
  { id: 'rt-1', name: 'Labour', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { id: 'rt-2', name: 'Equipment', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { id: 'rt-3', name: 'Material', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
]

export const resources = [
  { id: 'r-1', name: 'Senior Engineer', rateFloat: 185, typeId: 'rt-1',
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    type: resourceTypes[0] },
  { id: 'r-2', name: 'Project Manager', rateFloat: 160, typeId: 'rt-1',
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    type: resourceTypes[0] },
  { id: 'r-3', name: 'Excavator', rateFloat: 220, typeId: 'rt-2',
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
    type: resourceTypes[1] },
]

export const taskResources = {
  task: { id: 't6', title: 'Frontend Development', activityId: 'A2100', wbsCode: '2.1' },
  assignments: [
    { id: 'a-1', taskId: 't6', resourceId: 'r-1', hours: 320,
      createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      resource: resources[0],
      task: { id: 't6', title: 'Frontend Development', activityId: 'A2100', wbsCode: '2.1' } },
  ],
}

export const taskDependencies = {
  asPredecessor: [],
  asSuccessor: [
    { id: 'd2', predecessorId: 't4', successorId: 't6', type: 'FS', lag: 2,
      createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      predecessor: { id: 't4', title: 'Design Phase', wbsCode: '1.2' },
      successor: { id: 't6', title: 'Frontend Development', wbsCode: '2.1' } },
  ],
}

// Portfolio WBS tree (GET /portfolio/wbs). PortfolioView expects a SINGLE root
// node object (PortfolioData) with `children: PortfolioData[]`, and the root is
// pre-expanded via the id 'portfolio-root'. It calls renderNode(portfolioData)
// and reads node.children.length (no null guard), so the shape must match.
export const portfolioWbs = {
  id: 'portfolio-root',
  title: 'Portfolio',
  level: 0,
  wbsCode: '',
  isMilestone: false,
  predecessors: [],
  successors: [],
  children: projects.map((p) => ({
    id: p.id,
    title: p.name,
    level: 1,
    wbsCode: '1',
    isMilestone: false,
    projectId: p.id,
    project: { id: p.id, name: p.name, client: p.client },
    predecessors: [],
    successors: [],
    children: [],
  })),
}
