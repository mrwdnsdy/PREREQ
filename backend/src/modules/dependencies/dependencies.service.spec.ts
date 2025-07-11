import { Test, TestingModule } from '@nestjs/testing';
import { DependenciesService } from './dependencies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('DependenciesService', () => {
  let service: DependenciesService;
  let prismaService: PrismaService;

  const mockTask1 = {
    id: 'task1',
    title: 'Task 1',
    wbsCode: '1.1',
    projectId: 'project1',
  };

  const mockTask2 = {
    id: 'task2',
    title: 'Task 2',
    wbsCode: '1.2',
    projectId: 'project1',
  };

  const mockDependency = {
    id: 'dep1',
    predecessorId: 'task1',
    successorId: 'task2',
    type: 'FS',
    lag: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    predecessor: mockTask1,
    successor: mockTask2,
  };

  const mockPrismaService = {
    task: {
      findUnique: jest.fn(),
    },
    taskDependency: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependenciesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DependenciesService>(DependenciesService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset all mocks between tests to prevent interference
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      predecessorId: 'task1',
      successorId: 'task2',
      type: 'FS' as 'FS',
      lag: 0,
    };

    it('should create a valid dependency successfully', async () => {
      // Setup mocks for successful creation
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1) // predecessor
        .mockResolvedValueOnce(mockTask2); // successor
      mockPrismaService.taskDependency.findUnique
        .mockResolvedValueOnce(null) // no duplicate
        .mockResolvedValueOnce(null); // no circular ref
      mockPrismaService.taskDependency.create.mockResolvedValue(mockDependency);

      const result = await service.create(createDto);

      expect(result).toEqual(mockDependency);
      expect(mockPrismaService.taskDependency.create).toHaveBeenCalledWith({
        data: {
          predecessorId: 'task1',
          successorId: 'task2',
          type: 'FS',
          lag: 0,
        },
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      });
    });

    it('should throw BadRequestException for self-link (predecessor = successor)', async () => {
      const selfLinkDto = {
        predecessorId: 'task1',
        successorId: 'task1', // Same task!
        type: 'FS' as 'FS',
        lag: 0,
      };

      // The service should reject this immediately without any database calls
      await expect(service.create(selfLinkDto)).rejects.toThrow(
        new BadRequestException('Successor task cannot be the same as predecessor task (self-link not allowed)')
      );
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
      expect(mockPrismaService.task.findUnique).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when predecessor task does not exist', async () => {
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(null) // predecessor not found
        .mockResolvedValueOnce(mockTask2);

      await expect(service.create(createDto)).rejects.toThrow(
        new BadRequestException('Predecessor task with ID task1 not found')
      );
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when successor task does not exist', async () => {
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(null); // successor not found

      await expect(service.create(createDto)).rejects.toThrow(
        new BadRequestException('Successor task with ID task2 not found')
      );
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when tasks are in different projects', async () => {
      const taskInDifferentProject = {
        ...mockTask2,
        projectId: 'project2', // Different project
      };

      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(taskInDifferentProject);

      await expect(service.create(createDto)).rejects.toThrow(
        new BadRequestException('Tasks must be in the same project to create a dependency')
      );
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException for duplicate dependency pair', async () => {
      // Setup valid tasks first
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1) // predecessor
        .mockResolvedValueOnce(mockTask2); // successor
      
      // Mock existing dependency found
      mockPrismaService.taskDependency.findUnique
        .mockResolvedValueOnce(mockDependency) // duplicate found
        .mockResolvedValueOnce(null); // no circular ref

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for immediate circular reference', async () => {
      // Setup valid tasks first
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1) // predecessor
        .mockResolvedValueOnce(mockTask2); // successor

      // The service calls findUnique twice - once for duplicate check, once for circular check
      mockPrismaService.taskDependency.findUnique
        .mockResolvedValueOnce(null) // no duplicate found (first call)
        .mockResolvedValueOnce({       // circular ref found (second call)
          id: 'reverse-dep',
          predecessorId: 'task2',
          successorId: 'task1',
          type: 'FS',
          lag: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      await expect(service.create(createDto)).rejects.toThrow(
        new BadRequestException(
          'Cannot create dependency: this would create an immediate circular reference. ' +
          'A dependency already exists in the opposite direction between these tasks.'
        )
      );
      expect(mockPrismaService.taskDependency.create).not.toHaveBeenCalled();
    });

    it('should handle Prisma unique constraint error', async () => {
      // Setup valid tasks and no validation issues
      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(mockTask1) // predecessor
        .mockResolvedValueOnce(mockTask2); // successor
      mockPrismaService.taskDependency.findUnique
        .mockResolvedValueOnce(null) // no duplicate
        .mockResolvedValueOnce(null); // no circular ref

      const prismaError = new Error('Unique constraint failed');
      (prismaError as any).code = 'P2002';
      
      mockPrismaService.taskDependency.create.mockRejectedValue(prismaError);

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException('A dependency between these tasks already exists')
      );
    });
  });

  describe('findAll', () => {
    it('should return all dependencies', async () => {
      mockPrismaService.taskDependency.findMany.mockResolvedValue([mockDependency]);

      const result = await service.findAll();

      expect(result).toEqual([mockDependency]);
      expect(mockPrismaService.taskDependency.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true, projectId: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true, projectId: true }
          }
        },
        orderBy: [
          { predecessor: { wbsCode: 'asc' } },
          { successor: { wbsCode: 'asc' } }
        ]
      });
    });

    it('should filter by projectId when provided', async () => {
      mockPrismaService.taskDependency.findMany.mockResolvedValue([mockDependency]);

      const result = await service.findAll('project1');

      expect(result).toEqual([mockDependency]);
      expect(mockPrismaService.taskDependency.findMany).toHaveBeenCalledWith({
        where: {
          predecessor: { projectId: 'project1' },
          successor: { projectId: 'project1' }
        },
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true, projectId: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true, projectId: true }
          }
        },
        orderBy: [
          { predecessor: { wbsCode: 'asc' } },
          { successor: { wbsCode: 'asc' } }
        ]
      });
    });
  });

  describe('findOne', () => {
    it('should return a dependency by ID', async () => {
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(mockDependency);

      const result = await service.findOne('dep1');

      expect(result).toEqual(mockDependency);
      expect(mockPrismaService.taskDependency.findUnique).toHaveBeenCalledWith({
        where: { id: 'dep1' },
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      });
    });

    it('should throw NotFoundException when dependency not found', async () => {
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        new NotFoundException('Dependency with ID nonexistent not found')
      );
    });
  });

  describe('update', () => {
    const updateDto = {
      type: 'SS' as 'SS',
      lag: 5,
    };

    it('should update a dependency successfully', async () => {
      const updatedDependency = { ...mockDependency, ...updateDto };
      
      // Mock findOne call (which is called within update)
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(mockDependency);
      mockPrismaService.taskDependency.update.mockResolvedValue(updatedDependency);

      const result = await service.update('dep1', updateDto);

      expect(result).toEqual(updatedDependency);
      expect(mockPrismaService.taskDependency.update).toHaveBeenCalledWith({
        where: { id: 'dep1' },
        data: updateDto,
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      });
    });

    it('should throw NotFoundException when dependency to update not found', async () => {
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', updateDto)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.taskDependency.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a dependency successfully', async () => {
      // Mock findOne call (which is called within remove)
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(mockDependency);
      mockPrismaService.taskDependency.delete.mockResolvedValue(mockDependency);

      const result = await service.remove('dep1');

      expect(result).toEqual(mockDependency);
      expect(mockPrismaService.taskDependency.delete).toHaveBeenCalledWith({
        where: { id: 'dep1' },
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true }
          },
          successor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      });
    });

    it('should throw NotFoundException when dependency to remove not found', async () => {
      mockPrismaService.taskDependency.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.taskDependency.delete).not.toHaveBeenCalled();
    });
  });

  describe('findByTaskId', () => {
    it('should return dependencies for a specific task', async () => {
      const asPredecessor = [{ ...mockDependency, successorId: 'task3' }];
      const asSuccessor = [{ ...mockDependency, predecessorId: 'task0' }];

      mockPrismaService.taskDependency.findMany
        .mockResolvedValueOnce(asPredecessor)
        .mockResolvedValueOnce(asSuccessor);

      const result = await service.findByTaskId('task1');

      expect(result).toEqual({ asPredecessor, asSuccessor });
      expect(mockPrismaService.taskDependency.findMany).toHaveBeenCalledTimes(2);
    });
  });
}); 