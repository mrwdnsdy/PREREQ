import { Test, TestingModule } from '@nestjs/testing';
import { P6ImportService } from './p6-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TasksService } from '../tasks/tasks.service';

/**
 * Unit tests for the pure parsing logic in P6ImportService. The XER/XML
 * parsers consume untrusted, externally-authored files, so their field
 * mapping and numeric coercion are exactly where malformed input becomes a
 * production bug.
 */
describe('P6ImportService', () => {
  let service: P6ImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        P6ImportService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: TasksService, useValue: {} },
      ],
    }).compile();

    service = module.get<P6ImportService>(P6ImportService);
  });

  const call = (name: string, ...args: any[]): any => (service as any)[name](...args);

  describe('mapRelationType', () => {
    it.each([
      ['SS', 'SS'],
      ['FF', 'FF'],
      ['SF', 'SF'],
      ['FS', 'FS'],
      ['ss', 'SS'],
      ['unknown', 'FS'],
      ['', 'FS'],
    ])('maps %s -> %s', (input, expected) => {
      expect(call('mapRelationType', input)).toBe(expected);
    });
  });

  describe('parseXERContent', () => {
    it('extracts project, tasks and relations from tab-delimited XER text', async () => {
      const xer = [
        'PROJECT\tP1\tMy Project\t2025-01-01\t2025-12-31\t100000',
        'TASK\tT1\tW1\tDesign\t2025-01-01\t2025-02-01\tN\t',
        'TASK\tT2\tW2\tBuild\t2025-02-01\t2025-03-01\tY\tT1',
        'TASKPRED\tT1\tT2\tFS\t8',
      ].join('\n');

      const result = await call('parseXERContent', xer);

      expect(result.project).toMatchObject({
        proj_id: 'P1',
        proj_name: 'My Project',
        budget: 100000,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0]).toMatchObject({ task_id: 'T1', task_name: 'Design', is_milestone: false });
      expect(result.tasks[1]).toMatchObject({ task_id: 'T2', is_milestone: true, parent_id: 'T1' });

      expect(result.relations).toHaveLength(1);
      expect(result.relations[0]).toMatchObject({
        pred_task_id: 'T1',
        succ_task_id: 'T2',
        relation_type: 'FS',
        lag_hr_cnt: 8,
      });
    });

    it('defaults a missing budget to 0', async () => {
      const result = await call('parseXERContent', 'PROJECT\tP1\tName\t\t');
      expect(result.project.budget).toBe(0);
    });
  });

  describe('parseXMLContent', () => {
    it('extracts project, tasks and relations from XML', async () => {
      const xml = `
        <project>
          <id>P1</id>
          <name>My Project</name>
          <start_date>2025-01-01</start_date>
          <end_date>2025-12-31</end_date>
          <budget>250000</budget>
          <tasks>
            <task>
              <id>T1</id>
              <wbs_id>W1</wbs_id>
              <name>Design</name>
              <start_date>2025-01-01</start_date>
              <end_date>2025-02-01</end_date>
              <is_milestone>false</is_milestone>
            </task>
          </tasks>
          <relations>
            <relation>
              <pred_task_id>T1</pred_task_id>
              <succ_task_id>T2</succ_task_id>
              <relation_type>SS</relation_type>
              <lag_hr_cnt>4</lag_hr_cnt>
            </relation>
          </relations>
        </project>`;

      const result = await call('parseXMLContent', xml);

      expect(result.project).toMatchObject({ proj_id: 'P1', proj_name: 'My Project', budget: 250000 });
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]).toMatchObject({ task_id: 'T1', task_name: 'Design', is_milestone: false });
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0]).toMatchObject({ relation_type: 'SS', lag_hr_cnt: 4 });
    });
  });
});
