import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Unit tests for the cost/budget logic in TasksService.
 *
 * These focus on the deterministic, money-handling parts of the service
 * (direct-cost calculation, role-hour labour costing, and the recursive
 * budget rollup) because they drive the financial numbers users see and are
 * exactly where silent arithmetic/recursion bugs hide.
 */
describe('TasksService', () => {
  let service: TasksService;

  const mockPrisma = {
    task: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    project: {
      update: jest.fn(),
    },
  };

  const mockAuth = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    // resetAllMocks (not clearAllMocks) so queued mock*Once values never leak.
    jest.resetAllMocks();
  });

  // Helper to invoke the private methods under test without `any` noise everywhere.
  const call = (name: string, ...args: any[]): any => (service as any)[name](...args);

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateDirectCost', () => {
    it('sums labour, material and other costs', () => {
      const result: Decimal = call('calculateDirectCost', 100, 50, 25);
      expect(result.toNumber()).toBe(175);
    });

    it('treats undefined cost components as zero', () => {
      const result: Decimal = call('calculateDirectCost', undefined, undefined, undefined);
      expect(result.toNumber()).toBe(0);
    });

    it('derives labour cost from roleHours when provided, ignoring costLabor', () => {
      // Developer rate = 150 → 10h = 1500 labour, + 50 material + 0 other
      const result: Decimal = call('calculateDirectCost', 999, 50, 0, { Developer: 10 });
      expect(result.toNumber()).toBe(1550);
    });

    it('ignores an empty roleHours object and falls back to costLabor', () => {
      const result: Decimal = call('calculateDirectCost', 200, 0, 0, {});
      expect(result.toNumber()).toBe(200);
    });
  });

  describe('calculateLaborCostFromRoleHours', () => {
    it('applies the configured rate for a known role', () => {
      // Project Manager rate = 180
      const result: Decimal = call('calculateLaborCostFromRoleHours', { 'Project Manager': 2 });
      expect(result.toNumber()).toBe(360);
    });

    it('applies the default rate (125) for unknown roles', () => {
      const result: Decimal = call('calculateLaborCostFromRoleHours', { Astronaut: 4 });
      expect(result.toNumber()).toBe(500);
    });

    it('sums costs across multiple roles', () => {
      // Developer 150*10 = 1500 + Designer 120*5 = 600 = 2100
      const result: Decimal = call('calculateLaborCostFromRoleHours', { Developer: 10, Designer: 5 });
      expect(result.toNumber()).toBe(2100);
    });

    it('returns zero for an empty role-hours map', () => {
      const result: Decimal = call('calculateLaborCostFromRoleHours', {});
      expect(result.toNumber()).toBe(0);
    });

    it('handles fractional hours precisely', () => {
      // QA Engineer 100 * 1.5 = 150
      const result: Decimal = call('calculateLaborCostFromRoleHours', { 'QA Engineer': 1.5 });
      expect(result.toNumber()).toBe(150);
    });
  });

  describe('updateBudgetRollups', () => {
    it('stops immediately when the task is already in the visited set (cycle guard)', async () => {
      await call('updateBudgetRollups', 'taskA', new Set(['taskA']));
      expect(mockPrisma.task.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('returns quietly when the task does not exist', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await call('updateBudgetRollups', 'missing');
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('recomputes a leaf total from its direct costs and persists the change', async () => {
      mockPrisma.task.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'leaf') {
          return Promise.resolve({
            id: 'leaf',
            level: 2,
            projectId: 'proj',
            parentId: null, // no parent → no upward recursion to mock
            children: [],
            costLabor: new Decimal(100),
            costMaterial: new Decimal(50),
            costOther: new Decimal(25),
            totalCost: new Decimal(0),
          });
        }
        return Promise.resolve(null);
      });
      mockPrisma.task.update.mockResolvedValue({});

      await call('updateBudgetRollups', 'leaf');

      expect(mockPrisma.task.update).toHaveBeenCalledTimes(1);
      const updateArg = mockPrisma.task.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'leaf' });
      expect(updateArg.data.totalCost.toNumber()).toBe(175);
    });

    it('does not write when the recomputed total is unchanged', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'leaf',
        level: 2,
        projectId: 'proj',
        parentId: null,
        children: [],
        costLabor: new Decimal(100),
        costMaterial: new Decimal(50),
        costOther: new Decimal(25),
        totalCost: new Decimal(175), // already correct
      });

      await call('updateBudgetRollups', 'leaf');

      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('rolls leaf totals up into a parent and the project budget for a level-0 root', async () => {
      mockPrisma.task.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'root') {
          return Promise.resolve({
            id: 'root',
            level: 0,
            projectId: 'proj',
            parentId: null,
            children: [{ id: 'c1' }, { id: 'c2' }],
            costLabor: new Decimal(0),
            costMaterial: new Decimal(0),
            costOther: new Decimal(0),
            totalCost: new Decimal(0),
          });
        }
        // children are leaves
        return Promise.resolve({
          id: where.id,
          level: 1,
          projectId: 'proj',
          parentId: 'root',
          children: [],
          costLabor: new Decimal(where.id === 'c1' ? 100 : 50),
          costMaterial: new Decimal(0),
          costOther: new Decimal(0),
          totalCost: new Decimal(0),
        });
      });
      // Parent rollup reads freshly-updated child totals via findMany.
      mockPrisma.task.findMany.mockResolvedValue([
        { totalCost: new Decimal(100) },
        { totalCost: new Decimal(50) },
      ]);
      mockPrisma.task.update.mockResolvedValue({});
      mockPrisma.project.update.mockResolvedValue({});

      await call('updateBudgetRollups', 'root');

      // The root total should be the sum of its children (150) ...
      const rootUpdate = mockPrisma.task.update.mock.calls.find((c: any[]) => c[0].where.id === 'root');
      expect(rootUpdate).toBeDefined();
      expect(rootUpdate[0].data.totalCost.toNumber()).toBe(150);

      // ... and that should propagate to the project's budgetRollup.
      expect(mockPrisma.project.update).toHaveBeenCalledTimes(1);
      const projUpdate = mockPrisma.project.update.mock.calls[0][0];
      expect(projUpdate.where).toEqual({ id: 'proj' });
      expect(projUpdate.data.budgetRollup.toNumber()).toBe(150);
    });
  });
});
