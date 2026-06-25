import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';

/**
 * End-to-end coverage for the P6 file-import endpoints
 * (POST /projects/:projectId/import-p6/{xer,xml}) against a real database,
 * driving the actual sample files in backend/samples through multipart upload.
 *
 * Covers parsing, task/relation persistence, the milestone flag, the
 * project-access check, and the file-extension guard.
 */
describe('P6 import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testUser = { id: '', sub: '', email: 'p6-e2e@example.com' };

  const cleanDb = () =>
    prisma.$executeRawUnsafe('TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE');

  const sample = (name: string) => join(__dirname, '..', 'samples', name);

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
      data: { email: 'p6-e2e@example.com', cognitoId: 'p6-e2e-cognito-id', fullName: 'P6 E2E User' },
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
      .send({ name: 'P6 Target', startDate: '2024-01-01', endDate: '2024-12-31' })
      .expect(201);
    return res.body.id;
  };

  it('imports a P6 XER file: tasks, milestone flag and relations', async () => {
    const projectId = await createProject();

    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/import-p6/xer`)
      .attach('file', sample('sample.xer'), 'sample.xer')
      .expect(201);

    // The project name is overwritten from the file's PROJECT row.
    expect(res.body.project).toBe('Sample Project');
    expect(res.body.relationsImported).toBe(11);

    const tasks = await prisma.task.findMany({
      where: { projectId },
      select: { wbsCode: true, isMilestone: true, level: true },
    });
    const imported = tasks.filter((t) => t.level !== 0);
    expect(imported).toHaveLength(12);

    const wbsCodes = tasks.map((t) => t.wbsCode);
    expect(wbsCodes).toEqual(expect.arrayContaining(['1.0', '2.0', '4.0']));

    // Task "4.0" (Deployment) is flagged as a milestone in the file.
    const deployment = tasks.find((t) => t.wbsCode === '4.0');
    expect(deployment?.isMilestone).toBe(true);

    const relationCount = await prisma.taskRelation.count({
      where: { predecessor: { projectId } },
    });
    expect(relationCount).toBe(11);
  });

  it('imports a P6 XML file', async () => {
    const projectId = await createProject();

    const res = await request(app.getHttpServer())
      .post(`/projects/${projectId}/import-p6/xml`)
      .attach('file', sample('sample.xml'), 'sample.xml')
      .expect(201);

    expect(res.body.project).toBe('Sample Project');
    expect(res.body.relationsImported).toBe(11);

    const importedCount = await prisma.task.count({
      where: { projectId, level: { not: 0 } },
    });
    expect(importedCount).toBe(12);
  });

  it('rejects a file with the wrong extension (400)', async () => {
    const projectId = await createProject();

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/import-p6/xer`)
      .attach('file', Buffer.from('PROJECT\t1\tX'), 'notes.txt')
      .expect(400);
  });

  it('rejects an XER import for a project the user cannot access (403)', async () => {
    await request(app.getHttpServer())
      .post('/projects/no-such-project/import-p6/xer')
      .attach('file', sample('sample.xer'), 'sample.xer')
      .expect(403);
  });
});
