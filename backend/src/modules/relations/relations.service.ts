import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';

@Injectable()
export class RelationsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async create(predecessorId: string, createRelationDto: CreateRelationDto, userId: string) {
    // Get predecessor task to check project access
    const predecessor = await this.prisma.task.findUnique({
      where: { id: predecessorId },
      include: { project: true },
    });

    if (!predecessor) {
      throw new NotFoundException('Predecessor task not found');
    }

    // Get successor task
    const successor = await this.prisma.task.findUnique({
      where: { id: createRelationDto.successorId },
      include: { project: true },
    });

    if (!successor) {
      throw new NotFoundException('Successor task not found');
    }

    // Check if both tasks are in the same project
    if (predecessor.projectId !== successor.projectId) {
      throw new BadRequestException('Tasks must be in the same project');
    }

    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, predecessor.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Check for circular dependencies
    if (predecessorId === createRelationDto.successorId) {
      throw new BadRequestException('Cannot create relationship to self');
    }

    // Check if relationship already exists
    const existingRelation = await this.prisma.taskRelation.findUnique({
      where: {
        predecessorId_successorId: {
          predecessorId,
          successorId: createRelationDto.successorId,
        },
      },
    });

    if (existingRelation) {
      throw new BadRequestException('Relationship already exists');
    }

    // Check for circular dependencies by traversing the graph
    const hasCircularDependency = await this.checkCircularDependency(
      createRelationDto.successorId,
      predecessorId,
    );

    if (hasCircularDependency) {
      throw new BadRequestException('Circular dependency detected');
    }

    const relation = await this.prisma.taskRelation.create({
      data: {
        predecessorId,
        successorId: createRelationDto.successorId,
        type: createRelationDto.type,
        lag: createRelationDto.lag,
      },
      include: {
        predecessor: true,
        successor: true,
      },
    });

    return relation;
  }

  async update(predecessorId: string, relationId: string, updateRelationDto: UpdateRelationDto, userId: string) {
    const relation = await this.prisma.taskRelation.findUnique({
      where: { id: relationId },
      include: {
        predecessor: {
          include: { project: true },
        },
      },
    });

    if (!relation) {
      throw new NotFoundException('Relationship not found');
    }

    if (relation.predecessorId !== predecessorId) {
      throw new BadRequestException('Relationship does not belong to the specified predecessor');
    }

    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, relation.predecessor.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const updatedRelation = await this.prisma.taskRelation.update({
      where: { id: relationId },
      data: {
        ...(updateRelationDto.type && { type: updateRelationDto.type }),
        ...(updateRelationDto.lag !== undefined && { lag: updateRelationDto.lag }),
      },
      include: {
        predecessor: true,
        successor: true,
      },
    });

    return updatedRelation;
  }

  async remove(predecessorId: string, relationId: string, userId: string) {
    const relation = await this.prisma.taskRelation.findUnique({
      where: { id: relationId },
      include: {
        predecessor: {
          include: { project: true },
        },
      },
    });

    if (!relation) {
      throw new NotFoundException('Relationship not found');
    }

    if (relation.predecessorId !== predecessorId) {
      throw new BadRequestException('Relationship does not belong to the specified predecessor');
    }

    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, relation.predecessor.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    await this.prisma.taskRelation.delete({
      where: { id: relationId },
    });

    return { message: 'Relationship deleted successfully' };
  }

  async getTaskRelations(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const [predecessors, successors] = await Promise.all([
      this.prisma.taskRelation.findMany({
        where: { successorId: taskId },
        include: {
          predecessor: true,
        },
      }),
      this.prisma.taskRelation.findMany({
        where: { predecessorId: taskId },
        include: {
          successor: true,
        },
      }),
    ]);

    return {
      predecessors,
      successors,
    };
  }

  private async checkCircularDependency(startTaskId: string, targetTaskId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [startTaskId];

    while (queue.length > 0) {
      const currentTaskId = queue.shift()!;
      
      if (currentTaskId === targetTaskId) {
        return true;
      }

      if (visited.has(currentTaskId)) {
        continue;
      }

      visited.add(currentTaskId);

      const successors = await this.prisma.taskRelation.findMany({
        where: { predecessorId: currentTaskId },
        select: { successorId: true },
      });

      for (const successor of successors) {
        queue.push(successor.successorId);
      }
    }

    return false;
  }
} 