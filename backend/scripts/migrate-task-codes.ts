import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  let i = 1;
  for (const task of tasks) {
    const code = 'A' + i.toString().padStart(4, '0');
    await prisma.task.update({ where: { id: task.id }, data: { code } });
    i++;
  }
  console.log(`Assigned codes to ${tasks.length} tasks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect()); 