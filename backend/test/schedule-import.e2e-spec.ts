import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';

/**
 * End-to-end coverage for the schedule-import flow
 * (POST /tasks/project/:projectId/import-schedule) against a real database.
 *
 * This exercises the heaviest untested DB orchestration in the codebase:
 * building a WBS tree from flat rows, generating dotted codes, persisting the
 * tree, and the destructive "replaceExisting" path that wipes and recreates a
 * project's tasks.
 */
describe('Schedule import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUser = { id: '', sub: '', email: 'import-e2e@example.com' };

  const cleanDb = () =>
    prisma.$executeRawUnsafe('TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE');

  const importUrl = (projectId: string) =>
    `/tasks/project/${projectId}/import-schedule`;

  const rows = (
    list: Array<{ level: number; activityId: string; description: string }>,
  ) =>
    list.map((r) => ({
      ...r,
      startDate: '2025-01-01',
      finishDate: '2025-02-01',
    }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = testUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    prisma = app.get(PrismaService);
    await cleanDb();

    const user = await prisma.user.create({
      data: {
        email: 'import-e2e@example.com',
        cognitoId: 'import-e2e-cognito-id',
        fullName: 'Import E2E User',
      },
    });
    testUser.id = user.id;
    testUser.sub = user.id;
  });

  afterAll(async () => {
    if (prisma) {
      await cleanDb().catch(() => undefined);
    }
    await app?.close();
  });

  const createProject = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'Import Project', startDate: '2025-01-01', endDate: '2025-12-31' })
      .expect(201);
    return res.body.id;
  };

  it('imports a flat task list into a generated WBS tree', async () => {
    const projectId = await createProject();

    const res = await request(app.getHttpServer())
      .post(importUrl(projectId))
      .send({
        projectId,
        tasks: rows([
          { level: 1, activityId: 'A1', description: 'Phase A' },
          { level: 2, activityId: 'A2', description: 'Task A.1' },
          { level: 2, activityId: 'A3', description: 'Task A.2' },
        ]),
        options: { generateWbsCodes: true, replaceExisting: false },
      })
      .expect(201);

    expect(res.body).toMatchObject({ success: true, importedTasks: 3 });

    const tasks = await prisma.task.findMany({
      where: { projectId },
      select: { id: true, wbsCode: true, activityId: true, level: true, parentId: true },
    });
    const byActivity = Object.fromEntries(tasks.map((t) => [t.activityId, t]));

    // Imported activity ids are preserved and codes come from the in-memory tree.
    expect(byActivity['A1']).toMatchObject({ wbsCode: '1', level: 1, parentId: null });
    expect(byActivity['A2']).toMatchObject({ wbsCode: '1.1', level: 2 });
    expect(byActivity['A3']).toMatchObject({ wbsCode: '1.2', level: 2 });

    // The deeper tasks are nested under A1, not the project root.
    expect(byActivity['A2'].parentId).toBe(byActivity['A1'].id);

    // The pre-existing level-0 project root still exists alongside the import.
    const codes = tasks.map((t) => t.wbsCode);
    expect(codes).toEqual(expect.arrayContaining(['0', '1', '1.1', '1.2']));
  });

  it('replaceExisting wipes prior tasks and recreates the tree', async () => {
    const projectId = await createProject();

    await request(app.getHttpServer())
      .post(importUrl(projectId))
      .send({
        projectId,
        tasks: rows([{ level: 1, activityId: 'OLD1', description: 'Old phase' }]),
        options: { generateWbsCodes: true, replaceExisting: false },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(importUrl(projectId))
      .send({
        projectId,
        tasks: rows([{ level: 1, activityId: 'NEW1', description: 'New phase' }]),
        options: { generateWbsCodes: true, replaceExisting: true },
      })
      .expect(201);

    const activityIds = (
      await prisma.task.findMany({ where: { projectId }, select: { activityId: true } })
    ).map((t) => t.activityId);

    expect(activityIds).toContain('NEW1');
    expect(activityIds).not.toContain('OLD1');
  });

  it('rejects an import into a non-existent project (400)', async () => {
    await request(app.getHttpServer())
      .post(importUrl('does-not-exist'))
      .send({
        projectId: 'does-not-exist',
        tasks: rows([{ level: 1, activityId: 'X1', description: 'X' }]),
        options: { generateWbsCodes: true },
      })
      .expect(400);
  });
});
