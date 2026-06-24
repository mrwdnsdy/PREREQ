import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleImportService } from './schedule-import.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Unit tests for the pure parsing/hierarchy logic in ScheduleImportService.
 * These methods turn flat, user-supplied spreadsheet rows into a WBS tree and
 * interpret free-text resource strings, so they are high-risk and worth
 * pinning precisely.
 */
describe('ScheduleImportService', () => {
  let service: ScheduleImportService;

  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleImportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScheduleImportService>(ScheduleImportService);
  });

  const call = (name: string, ...args: any[]): any => (service as any)[name](...args);
  const row = (level: number, activityId: string, description: string): any => ({
    level,
    activityId,
    description,
  });

  describe('parseResourceInfo', () => {
    it('returns nulls for tasks below level 4', () => {
      expect(call('parseResourceInfo', 'Developer 2', 3)).toEqual({
        resourceRole: null,
        resourceQty: null,
        roleHours: null,
      });
    });

    it('returns nulls when no resourcing string is supplied', () => {
      expect(call('parseResourceInfo', undefined, 5)).toEqual({
        resourceRole: null,
        resourceQty: null,
        roleHours: null,
      });
    });

    it('parses the "Role: Nh" role-hours format', () => {
      const result = call('parseResourceInfo', 'Developer: 16h, Designer: 8h', 4);
      expect(result.roleHours).toEqual({ Developer: 16, Designer: 8 });
      expect(result.resourceRole).toBe('Developer');
      expect(result.resourceQty).toBe(16);
    });

    it('parses the legacy "Role qty" format', () => {
      const result = call('parseResourceInfo', 'Developer 1.5', 4);
      expect(result).toEqual({ resourceRole: 'Developer', resourceQty: 1.5, roleHours: null });
    });

    it('parses the "Role (qty)" parenthesised format', () => {
      const result = call('parseResourceInfo', 'PM (2.0)', 4);
      expect(result.resourceRole).toBe('PM');
      expect(result.resourceQty).toBe(2);
      expect(result.roleHours).toBeNull();
    });

    it('defaults to quantity 1 when only a bare role name is given', () => {
      const result = call('parseResourceInfo', 'Solutions Architect', 4);
      expect(result).toEqual({
        resourceRole: 'Solutions Architect',
        resourceQty: 1.0,
        roleHours: null,
      });
    });
  });

  describe('buildWbsHierarchy', () => {
    it('nests children under the nearest preceding parent level', () => {
      const roots = call('buildWbsHierarchy', [
        row(1, 'A1', 'Root'),
        row(2, 'A2', 'Child A'),
        row(2, 'A3', 'Child B'),
        row(3, 'A4', 'Grandchild'),
      ]);

      expect(roots).toHaveLength(1);
      expect(roots[0].activityId).toBe('A1');
      expect(roots[0].children.map((c: any) => c.activityId)).toEqual(['A2', 'A3']);

      const childB = roots[0].children.find((c: any) => c.activityId === 'A3');
      expect(childB.children.map((c: any) => c.activityId)).toEqual(['A4']);
    });

    it('treats a node with no available parent as a root', () => {
      const roots = call('buildWbsHierarchy', [
        row(1, 'A1', 'Root'),
        row(3, 'A9', 'Orphaned level 3'),
      ]);

      expect(roots.map((r: any) => r.activityId).sort()).toEqual(['A1', 'A9']);
    });
  });

  describe('generateWbsCodes', () => {
    it('assigns hierarchical dotted codes depth-first', () => {
      const roots = call('buildWbsHierarchy', [
        row(1, 'A1', 'Root'),
        row(2, 'A2', 'Child A'),
        row(2, 'A3', 'Child B'),
        row(3, 'A4', 'Grandchild'),
      ]);

      call('generateWbsCodes', roots);

      expect(roots[0].wbsCode).toBe('1');
      const codes = roots[0].children.map((c: any) => c.wbsCode);
      expect(codes).toEqual(['1.1', '1.2']);
      const childB = roots[0].children.find((c: any) => c.activityId === 'A3');
      expect(childB.children[0].wbsCode).toBe('1.2.1');
    });
  });
});
