import { Test, TestingModule } from '@nestjs/testing';
import { ResourceAssignmentsService } from './resource-assignments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('ResourceAssignmentsService', () => {
  let service: ResourceAssignmentsService;
  let prisma: any;

  const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    activityId: 'A1010',
    wbsCode: '1.1',
  };

  const mockResourceType = {
    id: 'type-1',
    name: 'Labour',
  };

  const mockResource = {
    id: 'resource-1',
    name: 'Senior Developer',
    rateFloat: 150.0,
    typeId: 'type-1',
    type: mockResourceType,
  };

  const mockAssignment = {
    id: 'assignment-1',
    taskId: 'task-1',
    resourceId: 'resource-1',
    hours: 40,
    resource: mockResource,
    task: mockTask,
  };

  beforeEach(async () => {
    const mockPrisma = {
      task: {
        findUnique: jest.fn(),
      },
      resource: {
        findMany: jest.fn(),
      },
      resourceAssignment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceAssignmentsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ResourceAssignmentsService>(ResourceAssignmentsService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMultipleAssignments', () => {
    const createMultiAssignmentDto = {
      assignments: [
        { resourceId: 'resource-1', hours: 40 },
        { resourceId: 'resource-2', hours: 20 },
      ],
    };

    it('should create multiple assignments successfully', async () => {
      prisma.task.findUnique.mockResolvedValue(mockTask as any);
      prisma.resource.findMany.mockResolvedValue([
        mockResource,
        { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
      ] as any);
      prisma.resourceAssignment.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([mockAssignment, { ...mockAssignment, id: 'assignment-2' }] as any);

      const result = await service.createMultipleAssignments('task-1', createMultiAssignmentDto);

      expect(result).toHaveLength(2);
      expect(prisma.task.findUnique).toHaveBeenCalledWith({ where: { id: 'task-1' } });
      expect(prisma.resource.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['resource-1', 'resource-2'] } },
      });
      expect(prisma.resourceAssignment.findMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1', resourceId: { in: ['resource-1', 'resource-2'] } },
      });
    });

    it('should throw NotFoundException when task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.createMultipleAssignments('invalid-task', createMultiAssignmentDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when resource does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(mockTask as any);
      prisma.resource.findMany.mockResolvedValue([mockResource] as any); // Only one resource found

      await expect(
        service.createMultipleAssignments('task-1', createMultiAssignmentDto)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when resource already assigned', async () => {
      prisma.task.findUnique.mockResolvedValue(mockTask as any);
      prisma.resource.findMany.mockResolvedValue([
        mockResource,
        { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
      ] as any);
      prisma.resourceAssignment.findMany.mockResolvedValue([mockAssignment] as any); // Existing assignment

      await expect(
        service.createMultipleAssignments('task-1', createMultiAssignmentDto)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findTaskAssignments', () => {
    it('should return task with assignments', async () => {
      prisma.task.findUnique.mockResolvedValue(mockTask as any);
      prisma.resourceAssignment.findMany.mockResolvedValue([mockAssignment] as any);

      const result = await service.findTaskAssignments('task-1');

      expect(result.task).toEqual(mockTask);
      expect(result.assignments).toHaveLength(1);
      expect(prisma.resourceAssignment.findMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        include: {
          resource: { include: { type: true } },
        },
        orderBy: [
          { resource: { type: { name: 'asc' } } },
          { resource: { name: 'asc' } },
        ],
      });
    });

    it('should throw NotFoundException when task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.findTaskAssignments('invalid-task')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAssignment', () => {
    const updateDto = { hours: 50 };

    it('should update assignment successfully', async () => {
      prisma.resourceAssignment.findUnique.mockResolvedValue(mockAssignment as any);
      prisma.resourceAssignment.update.mockResolvedValue({ ...mockAssignment, hours: 50 } as any);

      const result = await service.updateAssignment('assignment-1', updateDto);

      expect(result.hours).toBe(50);
      expect(prisma.resourceAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: updateDto,
        include: {
          resource: { include: { type: true } },
          task: { select: { id: true, title: true, activityId: true, wbsCode: true } },
        },
      });
    });

    it('should throw NotFoundException when assignment does not exist', async () => {
      prisma.resourceAssignment.findUnique.mockResolvedValue(null);

      await expect(service.updateAssignment('invalid-assignment', updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAssignment', () => {
    it('should delete assignment successfully', async () => {
      prisma.resourceAssignment.findUnique.mockResolvedValue(mockAssignment as any);
      prisma.resourceAssignment.delete.mockResolvedValue(mockAssignment as any);

      const result = await service.deleteAssignment('assignment-1');

      expect(result).toEqual(mockAssignment);
      expect(prisma.resourceAssignment.delete).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
      });
    });

    it('should throw NotFoundException when assignment does not exist', async () => {
      prisma.resourceAssignment.findUnique.mockResolvedValue(null);

      await expect(service.deleteAssignment('invalid-assignment')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableResources', () => {
    it('should return available resources filtered by type', async () => {
      prisma.task.findUnique.mockResolvedValue(mockTask as any);
      prisma.resourceAssignment.findMany.mockResolvedValue([{ resourceId: 'resource-1' }] as any);
      prisma.resource.findMany.mockResolvedValue([
        { ...mockResource, id: 'resource-2', name: 'Junior Developer' },
      ] as any);

      const result = await service.getAvailableResources('task-1', 'type-1');

      expect(result).toHaveLength(1);
      expect(prisma.resource.findMany).toHaveBeenCalledWith({
        where: { id: { notIn: ['resource-1'] }, typeId: 'type-1' },
        include: { type: true },
        orderBy: [{ type: { name: 'asc' } }, { name: 'asc' }],
      });
    });

    it('should throw NotFoundException when task does not exist', async () => {
      prisma.task.findUnique.mockResolvedValue(null);

      await expect(service.getAvailableResources('invalid-task')).rejects.toThrow(NotFoundException);
    });
  });
}); 