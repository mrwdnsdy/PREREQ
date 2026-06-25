import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';

/**
 * End-to-end tests that exercise the full request pipeline (routing, the global
 * ValidationPipe, guards, the project-access check, and the WBS/cost services)
 * against a real Postgres database.
 *
 * Auth is stubbed by overriding JwtAuthGuard to inject a known, DB-seeded user;
 * everything downstream — including AuthService.hasProjectAccess and all WBS
 * code/level/budget logic — runs for real against the database. This is the
 * layer the mocked unit tests deliberately do not cover.
 */
describe('Projects & Tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUser = { id: '', sub: '', email: 'e2e@example.com' };

  const cleanDb = () =>
    prisma.$executeRawUnsafe('TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE');

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
      data: { email: 'e2e@example.com', cognitoId: 'e2e-cognito-id', fullName: 'E2E User' },
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

  let projectId: string;
  let rootTaskId: string;
  let phase1Id: string;

  it('POST /projects creates a project, an ADMIN membership and a level-0 root task', async () => {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .send({ name: 'E2E Project', startDate: '2025-01-01', endDate: '2025-12-31', budget: 1000 })
      .expect(201);

    expect(res.body.id).toBeDefined();
    projectId = res.body.id;

    const member = await prisma.projectMember.findFirst({
      where: { projectId, userId: testUser.id },
    });
    expect(member?.role).toBe('ADMIN');

    const root = await prisma.task.findFirst({ where: { projectId, level: 0 } });
    expect(root).toBeTruthy();
    expect(root?.wbsCode).toBe('0');
    rootTaskId = root!.id;
  });

  // NOTE: the level-0 project root carries WBS code "0" and every task must be
  // created beneath it (a second level-0 task is rejected), so the generator
  // produces "0.1", "0.2", "0.1.1". This 0-prefixed scheme is the canonical one:
  // the schedule-import path was aligned to it, and WBS_HIERARCHY_RULES.md
  // documents it.
  it('POST /tasks generates sequential WBS codes for the root\'s direct children', async () => {
    const phase1 = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        projectId,
        parentId: rootTaskId,
        title: 'Phase 1',
        startDate: '2025-01-01',
        endDate: '2025-03-01',
      })
      .expect(201);
    phase1Id = phase1.body.id;
    expect(phase1.body.level).toBe(1);
    expect(phase1.body.wbsCode).toBe('0.1');

    const phase2 = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        projectId,
        parentId: rootTaskId,
        title: 'Phase 2',
        startDate: '2025-03-01',
        endDate: '2025-06-01',
      })
      .expect(201);
    expect(phase2.body.wbsCode).toBe('0.2');
  });

  it('POST /tasks nests a deeper child under its parent with a dotted WBS code', async () => {
    const child = await request(app.getHttpServer())
      .post('/tasks')
      .send({
        projectId,
        parentId: phase1Id,
        title: 'Phase 1.1',
        startDate: '2025-01-01',
        endDate: '2025-02-01',
      })
      .expect(201);

    expect(child.body.level).toBe(2);
    expect(child.body.wbsCode).toBe('0.1.1');
  });

  it('GET /tasks/project/:projectId returns all created tasks', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tasks/project/${projectId}`)
      .expect(200);

    const wbsCodes = res.body.map((t: any) => t.wbsCode);
    expect(wbsCodes).toEqual(expect.arrayContaining(['0', '0.1', '0.2', '0.1.1']));
  });

  it('rejects task creation for a project the user cannot access (403)', async () => {
    await request(app.getHttpServer())
      .post('/tasks')
      .send({
        projectId: 'non-existent-project',
        title: 'Nope',
        startDate: '2025-01-01',
        endDate: '2025-02-01',
      })
      .expect(403);
  });

  it('rejects invalid project payloads via the global ValidationPipe (400)', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .send({ startDate: 'not-a-date' }) // missing required name, invalid date
      .expect(400);
  });
});
