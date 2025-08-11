import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, activityId: true },
  });

  let count = 1;
  for (const task of tasks) {
    const newActivityId = `A${count.toString().padStart(4, '0')}`;
    if (task.activityId !== newActivityId) {
      await prisma.task.update({
        where: { id: task.id },
        data: { activityId: newActivityId },
      });
      console.log(`Updated task ${task.id}: ${task.activityId} -> ${newActivityId}`);
    }
    count++;
  }

  console.log('Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 