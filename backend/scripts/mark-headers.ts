import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markHeaders() {
  // Find all tasks that are parents (i.e., have at least one child)
  const parentTasks = await prisma.task.findMany({
    where: {
      // Find tasks where at least one other task has parentId = this task's id
      children: {
        some: {},
      },
    },
    select: { id: true },
  });

  const parentIds = parentTasks.map(t => t.id);

  if (parentIds.length === 0) {
    console.log('No parent tasks found.');
    return;
  }

  // Update all parent tasks to set isHeader = true
  const result = await prisma.task.updateMany({
    where: { id: { in: parentIds } },
    data: { isHeader: true },
  });

  console.log(`Updated ${result.count} tasks to isHeader=true.`);
}

markHeaders()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 