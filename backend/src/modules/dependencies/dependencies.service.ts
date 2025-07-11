import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { UpdateDependencyDto } from './dto/update-dependency.dto';
import { TaskDependency } from '@prisma/client';

@Injectable()
export class DependenciesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new task dependency with validation
   */
  async create(createDependencyDto: CreateDependencyDto): Promise<TaskDependency> {
    const { predecessorId, successorId, type, lag } = createDependencyDto;

    // Check for self-link (same task as predecessor and successor)
    if (predecessorId === successorId) {
      throw new BadRequestException('Successor task cannot be the same as predecessor task (self-link not allowed)');
    }

    // Validate that both tasks exist
    await this.validateTasksExist(predecessorId, successorId);

    // Check for duplicate dependency
    await this.checkForDuplicate(predecessorId, successorId);

    // Check for immediate circular reference (depth-1)
    await this.checkForImmediateCircularReference(predecessorId, successorId);

    try {
      return await this.prisma.taskDependency.create({
        data: {
          predecessorId,
          successorId,
          type,
          lag: lag ?? 0,
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
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('A dependency between these tasks already exists');
      }
      throw error;
    }
  }

  /**
   * Find all dependencies with optional filtering
   */
  async findAll(projectId?: string): Promise<TaskDependency[]> {
    const whereClause = projectId ? {
      predecessor: { projectId },
      successor: { projectId }
    } : {};

    return this.prisma.taskDependency.findMany({
      where: whereClause,
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
  }

  /**
   * Find dependencies for a specific task (both as predecessor and successor)
   */
  async findByTaskId(taskId: string): Promise<{
    asPredecessor: TaskDependency[];
    asSuccessor: TaskDependency[];
  }> {
    const [asPredecessor, asSuccessor] = await Promise.all([
      this.prisma.taskDependency.findMany({
        where: { predecessorId: taskId },
        include: {
          successor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      }),
      this.prisma.taskDependency.findMany({
        where: { successorId: taskId },
        include: {
          predecessor: {
            select: { id: true, title: true, wbsCode: true }
          }
        }
      })
    ]);

    return { asPredecessor, asSuccessor };
  }

  /**
   * Find a single dependency by ID
   */
  async findOne(id: string): Promise<TaskDependency> {
    const dependency = await this.prisma.taskDependency.findUnique({
      where: { id },
      include: {
        predecessor: {
          select: { id: true, title: true, wbsCode: true }
        },
        successor: {
          select: { id: true, title: true, wbsCode: true }
        }
      }
    });

    if (!dependency) {
      throw new NotFoundException(`Dependency with ID ${id} not found`);
    }

    return dependency;
  }

  /**
   * Update a dependency (only type and lag can be updated)
   */
  async update(id: string, updateDependencyDto: UpdateDependencyDto): Promise<TaskDependency> {
    // Verify dependency exists
    await this.findOne(id);

    return this.prisma.taskDependency.update({
      where: { id },
      data: updateDependencyDto,
      include: {
        predecessor: {
          select: { id: true, title: true, wbsCode: true }
        },
        successor: {
          select: { id: true, title: true, wbsCode: true }
        }
      }
    });
  }

  /**
   * Remove a dependency
   */
  async remove(id: string): Promise<TaskDependency> {
    // Verify dependency exists
    await this.findOne(id);

    return this.prisma.taskDependency.delete({
      where: { id },
      include: {
        predecessor: {
          select: { id: true, title: true, wbsCode: true }
        },
        successor: {
          select: { id: true, title: true, wbsCode: true }
        }
      }
    });
  }

  /**
   * Validate that both predecessor and successor tasks exist
   */
  private async validateTasksExist(predecessorId: string, successorId: string): Promise<void> {
    const [predecessor, successor] = await Promise.all([
      this.prisma.task.findUnique({ where: { id: predecessorId } }),
      this.prisma.task.findUnique({ where: { id: successorId } })
    ]);

    if (!predecessor) {
      throw new BadRequestException(`Predecessor task with ID ${predecessorId} not found`);
    }

    if (!successor) {
      throw new BadRequestException(`Successor task with ID ${successorId} not found`);
    }

    // Ensure tasks are in the same project
    if (predecessor.projectId !== successor.projectId) {
      throw new BadRequestException('Tasks must be in the same project to create a dependency');
    }
  }

  /**
   * Check for duplicate dependency between the same tasks
   */
  private async checkForDuplicate(predecessorId: string, successorId: string): Promise<void> {
    const existingDependency = await this.prisma.taskDependency.findUnique({
      where: {
        predecessorId_successorId: {
          predecessorId,
          successorId
        }
      }
    });

    if (existingDependency) {
      throw new ConflictException(`A dependency already exists between these tasks`);
    }
  }

  /**
   * Check for immediate circular reference (depth-1 check)
   * Prevents A -> B when B -> A already exists
   */
  private async checkForImmediateCircularReference(predecessorId: string, successorId: string): Promise<void> {
    const reverseRelation = await this.prisma.taskDependency.findUnique({
      where: {
        predecessorId_successorId: {
          predecessorId: successorId,
          successorId: predecessorId
        }
      }
    });

    if (reverseRelation) {
      throw new BadRequestException(
        'Cannot create dependency: this would create an immediate circular reference. ' +
        'A dependency already exists in the opposite direction between these tasks.'
      );
    }
  }
} 