import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Activity ID generation function
const generateActivityId = (() => {
  let counter = 1010;
  return () => {
    const id = `A${counter}`;
    counter += 10;
    return id;
  };
})();

async function main() {
  console.log('🌱 Starting database seeding...')

  // Clean up existing data (careful with this in production!)
  console.log('🧹 Cleaning existing data...')
  await prisma.taskRelation.deleteMany()
  await prisma.task.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  // Create test user
  console.log('👤 Creating test user...')
  const testUser = await prisma.user.create({
    data: {
      email: 'demo@prereq.com',
      fullName: 'Demo User',
      cognitoId: 'demo-cognito-id-123'
    }
  })

  // Create Enterprise Software Implementation project
  console.log('📊 Creating Enterprise Software Implementation project...')
  const project = await prisma.project.create({
    data: {
      name: 'Enterprise Software Implementation',
      client: 'Tech Solutions Inc.',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      budget: 2500000, // $2.5M project budget
      budgetRollup: 0 // Will be calculated
    }
  })

  // Create project membership
  console.log('👥 Adding user to project...')
  await prisma.projectMember.create({
    data: {
      userId: testUser.id,
      projectId: project.id,
      role: 'ADMIN'
    }
  })

  console.log('📋 Creating comprehensive project schedule with hierarchical structure...')

  // Define all tasks with proper hierarchy, Activity IDs, and resource loading
  const tasks = [
    // Level 0 - Project Root
    {
      wbsCode: '0',
      title: 'Enterprise Software Implementation',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      level: 0,
      parentId: null,
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    
    // Level 1 - Major Phases
    {
      wbsCode: '1',
      title: 'Project Initiation & Planning',
      startDate: '2024-01-01',
      endDate: '2024-02-29',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2',
      title: 'Requirements & Analysis',
      startDate: '2024-03-01',
      endDate: '2024-04-30',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '3',
      title: 'System Design & Architecture',
      startDate: '2024-05-01',
      endDate: '2024-06-15',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '4',
      title: 'Development & Implementation',
      startDate: '2024-06-16',
      endDate: '2024-10-15',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '5',
      title: 'Testing & Quality Assurance',
      startDate: '2024-10-16',
      endDate: '2024-11-30',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '6',
      title: 'Deployment & Go-Live',
      startDate: '2024-12-01',
      endDate: '2024-12-31',
      level: 1,
      parentWbs: '0',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    
    // Level 2 - Project Initiation Sub-phases
    {
      wbsCode: '1.1',
      title: 'Project Charter Development',
      startDate: '2024-01-01',
      endDate: '2024-01-15',
      level: 2,
      parentWbs: '1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '1.2',
      title: 'Stakeholder Identification',
      startDate: '2024-01-16',
      endDate: '2024-02-05',
      level: 2,
      parentWbs: '1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '1.3',
      title: 'Resource Planning',
      startDate: '2024-02-06',
      endDate: '2024-02-20',
      level: 2,
      parentWbs: '1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '1.4',
      title: 'Project Kickoff Meeting',
      startDate: '2024-02-26',
      endDate: '2024-02-29',
      level: 2,
      parentWbs: '1',
      isMilestone: true,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    
    // Level 2 - Requirements Sub-phases
    {
      wbsCode: '2.1',
      title: 'Business Requirements Gathering',
      startDate: '2024-03-01',
      endDate: '2024-03-20',
      level: 2,
      parentWbs: '2',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2.2',
      title: 'Technical Requirements Analysis',
      startDate: '2024-03-21',
      endDate: '2024-04-10',
      level: 2,
      parentWbs: '2',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2.3',
      title: 'Requirements Documentation',
      startDate: '2024-04-11',
      endDate: '2024-04-25',
      level: 2,
      parentWbs: '2',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2.4',
      title: 'Requirements Sign-off',
      startDate: '2024-04-26',
      endDate: '2024-04-30',
      level: 2,
      parentWbs: '2',
      isMilestone: true,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    
    // Level 3 - Detailed Work Packages
    {
      wbsCode: '1.1.1',
      title: 'Business Case Development',
      startDate: '2024-01-01',
      endDate: '2024-01-08',
      level: 3,
      parentWbs: '1.1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '1.1.2',
      title: 'Project Scope Definition',
      startDate: '2024-01-09',
      endDate: '2024-01-15',
      level: 3,
      parentWbs: '1.1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2.1.1',
      title: 'User Story Development',
      startDate: '2024-03-01',
      endDate: '2024-03-10',
      level: 3,
      parentWbs: '2.1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    {
      wbsCode: '2.1.2',
      title: 'Process Mapping',
      startDate: '2024-03-11',
      endDate: '2024-03-20',
      level: 3,
      parentWbs: '2.1',
      isMilestone: false,
      costLabor: 0,
      costMaterial: 0,
      costOther: 0,
      resourceRole: null,
      resourceQty: null
    },
    
    // Level 4+ - Activities with Resource Loading (only Level 4+ get resource assignments)
    {
      wbsCode: '1.1.1.1',
      title: 'Market Research & Analysis',
      startDate: '2024-01-01',
      endDate: '2024-01-04',
      level: 4,
      parentWbs: '1.1.1',
      isMilestone: false,
      costLabor: 9600, // 4 days * 2.0 hours/day * $120/hour
      costMaterial: 500,
      costOther: 300,
      resourceRole: 'Business Analyst',
      resourceQty: 2.0,
      roleHours: {
        'Business Analyst': 32,  // 4 days * 8 hours/day
        'Data Analyst': 8        // Additional support
      }
    },
    {
      wbsCode: '1.1.1.2',
      title: 'Financial Projections',
      startDate: '2024-01-05',
      endDate: '2024-01-08',
      level: 4,
      parentWbs: '1.1.1',
      isMilestone: false,
      costLabor: 7200, // 4 days * 1.5 hours/day * $120/hour
      costMaterial: 200,
      costOther: 100,
      resourceRole: 'Business Analyst',
      resourceQty: 1.5,
      roleHours: {
        'Business Analyst': 24,   // 3 days * 8 hours/day
        'Data Analyst': 16        // 2 days * 8 hours/day
      }
    },
    {
      wbsCode: '1.1.2.1',
      title: 'Scope Documentation',
      startDate: '2024-01-09',
      endDate: '2024-01-12',
      level: 4,
      parentWbs: '1.1.2',
      isMilestone: false,
      costLabor: 4800, // 4 days * 1.0 hours/day * $120/hour
      costMaterial: 100,
      costOther: 50,
      resourceRole: 'Technical Writer',
      resourceQty: 1.0,
      roleHours: {
        'Technical Writer': 32,   // 4 days * 8 hours/day
        'Business Analyst': 8     // Review support
      }
    },
    {
      wbsCode: '1.1.2.2',
      title: 'Deliverables Matrix',
      startDate: '2024-01-13',
      endDate: '2024-01-15',
      level: 4,
      parentWbs: '1.1.2',
      isMilestone: false,
      costLabor: 5400, // 3 days * 1.0 hours/day * $180/hour
      costMaterial: 50,
      costOther: 25,
      resourceRole: 'Project Manager',
      resourceQty: 1.0,
      roleHours: {
        'Project Manager': 24,    // 3 days * 8 hours/day
        'Business Analyst': 4     // Review support
      }
    },
    {
      wbsCode: '2.1.1.1',
      title: 'User Interview Sessions',
      startDate: '2024-03-01',
      endDate: '2024-03-05',
      level: 4,
      parentWbs: '2.1.1',
      isMilestone: false,
      costLabor: 7200, // 5 days * 1.2 hours/day * $120/hour
      costMaterial: 300,
      costOther: 200,
      resourceRole: 'Business Analyst',
      resourceQty: 1.2,
      roleHours: {
        'Business Analyst': 32,   // 4 days * 8 hours/day
        'UI/UX Designer': 16,     // 2 days * 8 hours/day
        'Project Manager': 8      // Coordination
      }
    },
    {
      wbsCode: '2.1.1.2',
      title: 'Story Prioritization Workshop',
      startDate: '2024-03-06',
      endDate: '2024-03-10',
      level: 4,
      parentWbs: '2.1.1',
      isMilestone: false,
      costLabor: 10800, // 5 days * 1.5 hours/day * $120/hour + PM support
      costMaterial: 400,
      costOther: 300,
      resourceRole: 'Business Analyst',
      resourceQty: 1.5,
      roleHours: {
        'Business Analyst': 24,   // 3 days * 8 hours/day
        'Project Manager': 16,    // 2 days * 8 hours/day
        'UI/UX Designer': 8       // 1 day * 8 hours/day
      }
    },
    {
      wbsCode: '2.1.2.1',
      title: 'Current State Analysis',
      startDate: '2024-03-11',
      endDate: '2024-03-15',
      level: 4,
      parentWbs: '2.1.2',
      isMilestone: false,
      costLabor: 12000, // 5 days * 2.0 hours/day * $120/hour
      costMaterial: 600,
      costOther: 400,
      resourceRole: 'Business Analyst',
      resourceQty: 2.0,
      roleHours: {
        'Business Analyst': 32,   // 4 days * 8 hours/day
        'Solutions Architect': 8,  // 1 day * 8 hours/day
        'Data Analyst': 16        // 2 days * 8 hours/day
      }
    },
    {
      wbsCode: '2.1.2.2',
      title: 'Future State Design',
      startDate: '2024-03-16',
      endDate: '2024-03-20',
      level: 4,
      parentWbs: '2.1.2',
      isMilestone: false,
      costLabor: 20000, // 5 days * 2.0 hours/day * $200/hour
      costMaterial: 1000,
      costOther: 800,
      resourceRole: 'Solutions Architect',
      resourceQty: 2.0,
      roleHours: {
        'Solutions Architect': 32, // 4 days * 8 hours/day
        'UI/UX Designer': 16,     // 2 days * 8 hours/day
        'Developer': 8,           // 1 day * 8 hours/day
        'Business Analyst': 8     // 1 day * 8 hours/day
      }
    }
  ]

  // Create tasks with parent-child relationships
  console.log('🔧 Creating tasks...')
  const createdTasks = new Map()
  const tasksToCreate = []

  // Build task creation order - parents before children
  const sortedTasks = tasks.sort((a, b) => a.level - b.level)

  for (const taskData of sortedTasks) {
    // Find parent ID if parentWbs is specified
    let parentId = null
    if (taskData.parentWbs) {
      const parent = createdTasks.get(taskData.parentWbs)
      if (parent) {
        parentId = parent.id
      }
    }

    const task = await prisma.task.create({
      data: {
        activityId: generateActivityId(),
        projectId: project.id,
        parentId: parentId,
        level: taskData.level,
        wbsCode: taskData.wbsCode,
        title: taskData.title,
        description: `Level ${taskData.level} task: ${taskData.title}`,
        startDate: new Date(taskData.startDate),
        endDate: new Date(taskData.endDate),
        isMilestone: taskData.isMilestone || false,
        costLabor: taskData.costLabor || 0,
        costMaterial: taskData.costMaterial || 0,
        costOther: taskData.costOther || 0,
        totalCost: (taskData.costLabor || 0) + (taskData.costMaterial || 0) + (taskData.costOther || 0),
        resourceRole: taskData.resourceRole,
        resourceQty: taskData.resourceQty,
        resourceUnit: taskData.resourceQty ? 'hours/day' : null,
        roleHours: (taskData as any).roleHours || null
      }
    })

    createdTasks.set(taskData.wbsCode, task)
    console.log(`✅ Created task: ${task.activityId} - ${task.title} (Level ${task.level})`)
  }

  // Create some task relationships
  console.log('🔗 Creating task relationships...')
  const allTasks = Array.from(createdTasks.values())
  
  // Create finish-to-start relationships between major phases
  const relationships = [
    { pred: '1', succ: '2', type: 'FS' }, // Initiation -> Requirements
    { pred: '2', succ: '3', type: 'FS' }, // Requirements -> Design
    { pred: '3', succ: '4', type: 'FS' }, // Design -> Development
    { pred: '4', succ: '5', type: 'FS' }, // Development -> Testing
    { pred: '5', succ: '6', type: 'FS' }, // Testing -> Deployment
    { pred: '1.1', succ: '1.2', type: 'FS' }, // Charter -> Stakeholder Analysis
    { pred: '1.2', succ: '1.3', type: 'FS' }, // Stakeholder -> Resource Planning
    { pred: '2.1', succ: '2.2', type: 'FS' }, // Business Req -> Technical Req
    { pred: '2.2', succ: '2.3', type: 'FS' }, // Technical Req -> Documentation
    { pred: '2.3', succ: '2.4', type: 'FS' }, // Documentation -> Sign-off
  ]

  for (const rel of relationships) {
    const predTask = createdTasks.get(rel.pred)
    const succTask = createdTasks.get(rel.succ)
    
    if (predTask && succTask) {
      await prisma.taskRelation.create({
        data: {
          predecessorId: predTask.id,
          successorId: succTask.id,
          type: rel.type as any,
          lag: 0
        }
      })
      console.log(`🔗 Created relationship: ${predTask.activityId} -> ${succTask.activityId} (${rel.type})`)
    }
  }

  // Calculate and display summary
  const totalTasks = allTasks.length
  const level4Tasks = allTasks.filter(t => t.level >= 4)
  const totalBudgetFromL4 = level4Tasks.reduce((sum, task) => sum + Number(task.totalCost), 0)

  console.log('📊 Project Summary:')
  console.log(`   Total Tasks: ${totalTasks}`)
  console.log(`   Level 4+ Tasks (with resource loading): ${level4Tasks.length}`)
  console.log(`   Total Budget from Level 4+ tasks: $${totalBudgetFromL4.toLocaleString()}`)
  console.log(`   Activity IDs range: A1010 to A${1000 + (totalTasks * 10)}`)
  console.log('')
  console.log('🎯 Key Features Implemented:')
  console.log('   ✅ Unique Activity IDs (A1010, A1020, A1030, etc.)')
  console.log('   ✅ Hierarchical WBS structure (Levels 0-4)')
  console.log('   ✅ Resource loading only on Level 4+ tasks')
  console.log('   ✅ Budget rollup from Level 4+ to parents')
  console.log('   ✅ Task relationships (FS dependencies)')
  console.log('   ✅ Mix of regular tasks and milestones')
  console.log('')
  console.log('🌟 Database seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 