import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

interface IdMapping {
  [oldId: string]: string;
}

async function migrateToUuid() {
  console.log('Starting UUID migration...');

  try {
    // Step 1: Create ID mappings for all tables
    const mappings: { [table: string]: IdMapping } = {};

    // Users
    console.log('Mapping Users...');
    const users = await prisma.user.findMany();
    mappings.users = {};
    for (const user of users) {
      mappings.users[user.id] = uuidv4();
    }

    // Projects
    console.log('Mapping Projects...');
    const projects = await prisma.project.findMany();
    mappings.projects = {};
    for (const project of projects) {
      mappings.projects[project.id] = uuidv4();
    }

    // ResourceTypes
    console.log('Mapping ResourceTypes...');
    const resourceTypes = await prisma.resourceType.findMany();
    mappings.resourceTypes = {};
    for (const resourceType of resourceTypes) {
      mappings.resourceTypes[resourceType.id] = uuidv4();
    }

    // Resources
    console.log('Mapping Resources...');
    const resources = await prisma.resource.findMany();
    mappings.resources = {};
    for (const resource of resources) {
      mappings.resources[resource.id] = uuidv4();
    }

    // Tasks
    console.log('Mapping Tasks...');
    const tasks = await prisma.task.findMany();
    mappings.tasks = {};
    for (const task of tasks) {
      mappings.tasks[task.id] = uuidv4();
    }

    // TaskRelations
    console.log('Mapping TaskRelations...');
    const taskRelations = await prisma.taskRelation.findMany();
    mappings.taskRelations = {};
    for (const taskRelation of taskRelations) {
      mappings.taskRelations[taskRelation.id] = uuidv4();
    }

    // TaskDependencies
    console.log('Mapping TaskDependencies...');
    const taskDependencies = await prisma.taskDependency.findMany();
    mappings.taskDependencies = {};
    for (const taskDependency of taskDependencies) {
      mappings.taskDependencies[taskDependency.id] = uuidv4();
    }

    // ProjectMembers
    console.log('Mapping ProjectMembers...');
    const projectMembers = await prisma.projectMember.findMany();
    mappings.projectMembers = {};
    for (const projectMember of projectMembers) {
      mappings.projectMembers[projectMember.id] = uuidv4();
    }

    // ResourceAssignments
    console.log('Mapping ResourceAssignments...');
    const resourceAssignments = await prisma.resourceAssignment.findMany();
    mappings.resourceAssignments = {};
    for (const resourceAssignment of resourceAssignments) {
      mappings.resourceAssignments[resourceAssignment.id] = uuidv4();
    }

    // Step 2: Update tables in dependency order (no foreign keys first, then with foreign keys)

    // Update Users (no foreign key dependencies)
    console.log('Updating Users...');
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { id: mappings.users[user.id] }
      });
    }

    // Update Projects (no foreign key dependencies)
    console.log('Updating Projects...');
    for (const project of projects) {
      await prisma.project.update({
        where: { id: project.id },
        data: { id: mappings.projects[project.id] }
      });
    }

    // Update ResourceTypes (no foreign key dependencies)
    console.log('Updating ResourceTypes...');
    for (const resourceType of resourceTypes) {
      await prisma.resourceType.update({
        where: { id: resourceType.id },
        data: { id: mappings.resourceTypes[resourceType.id] }
      });
    }

    // Update Resources (depends on ResourceTypes)
    console.log('Updating Resources...');
    for (const resource of resources) {
      await prisma.resource.update({
        where: { id: resource.id },
        data: { 
          id: mappings.resources[resource.id],
          typeId: mappings.resourceTypes[resource.typeId]
        }
      });
    }

    // Update Tasks (depends on Projects)
    console.log('Updating Tasks...');
    for (const task of tasks) {
      const updateData: any = {
        id: mappings.tasks[task.id],
        projectId: mappings.projects[task.projectId],
        activityId: uuidv4() // Generate new activityId
      };

      if (task.parentId) {
        updateData.parentId = mappings.tasks[task.parentId];
      }

      await prisma.task.update({
        where: { id: task.id },
        data: updateData
      });
    }

    // Update TaskRelations (depends on Tasks)
    console.log('Updating TaskRelations...');
    for (const taskRelation of taskRelations) {
      await prisma.taskRelation.update({
        where: { id: taskRelation.id },
        data: {
          id: mappings.taskRelations[taskRelation.id],
          predecessorId: mappings.tasks[taskRelation.predecessorId],
          successorId: mappings.tasks[taskRelation.successorId]
        }
      });
    }

    // Update TaskDependencies (depends on Tasks)
    console.log('Updating TaskDependencies...');
    for (const taskDependency of taskDependencies) {
      await prisma.taskDependency.update({
        where: { id: taskDependency.id },
        data: {
          id: mappings.taskDependencies[taskDependency.id],
          predecessorId: mappings.tasks[taskDependency.predecessorId],
          successorId: mappings.tasks[taskDependency.successorId]
        }
      });
    }

    // Update ProjectMembers (depends on Users and Projects)
    console.log('Updating ProjectMembers...');
    for (const projectMember of projectMembers) {
      await prisma.projectMember.update({
        where: { id: projectMember.id },
        data: {
          id: mappings.projectMembers[projectMember.id],
          userId: mappings.users[projectMember.userId],
          projectId: mappings.projects[projectMember.projectId]
        }
      });
    }

    // Update ResourceAssignments (depends on Tasks and Resources)
    console.log('Updating ResourceAssignments...');
    for (const resourceAssignment of resourceAssignments) {
      await prisma.resourceAssignment.update({
        where: { id: resourceAssignment.id },
        data: {
          id: mappings.resourceAssignments[resourceAssignment.id],
          taskId: mappings.tasks[resourceAssignment.taskId],
          resourceId: mappings.resources[resourceAssignment.resourceId]
        }
      });
    }

    console.log('UUID migration completed successfully!');
    console.log('Summary of changes:');
    console.log(`- Users: ${users.length}`);
    console.log(`- Projects: ${projects.length}`);
    console.log(`- ResourceTypes: ${resourceTypes.length}`);
    console.log(`- Resources: ${resources.length}`);
    console.log(`- Tasks: ${tasks.length}`);
    console.log(`- TaskRelations: ${taskRelations.length}`);
    console.log(`- TaskDependencies: ${taskDependencies.length}`);
    console.log(`- ProjectMembers: ${projectMembers.length}`);
    console.log(`- ResourceAssignments: ${resourceAssignments.length}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateToUuid()
  .then(() => {
    console.log('Migration script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  }); 