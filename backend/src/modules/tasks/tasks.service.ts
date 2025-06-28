import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  private calculateLevel(parentId: string | null, projectId: string): Promise<number> {
    if (!parentId) return Promise.resolve(1);
    
    return this.prisma.task.findUnique({
      where: { id: parentId },
      select: { level: true },
    }).then(parent => {
      if (!parent) throw new BadRequestException('Parent task not found');
      if (parent.level >= 10) throw new BadRequestException('Cannot create tasks deeper than level 10');
      return parent.level + 1;
    });
  }

  async create(createTaskDto: CreateTaskDto, userId: string) {
    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, createTaskDto.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Calculate level based on parent
    const level = await this.calculateLevel(createTaskDto.parentId, createTaskDto.projectId);

    // Validate parent is in same project
    if (createTaskDto.parentId) {
      const parent = await this.prisma.task.findFirst({
        where: {
          id: createTaskDto.parentId,
          projectId: createTaskDto.projectId,
        },
      });
      if (!parent) {
        throw new BadRequestException('Parent task must be in the same project');
      }
    }

    const task = await this.prisma.task.create({
      data: {
        ...createTaskDto,
        level,
        startDate: new Date(createTaskDto.startDate),
        endDate: new Date(createTaskDto.endDate),
      },
      include: {
        predecessors: {
          include: {
            predecessor: true,
          },
        },
        successors: {
          include: {
            successor: true,
          },
        },
        children: true,
      },
    });

    return task;
  }

  async findAll(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        predecessors: {
          include: {
            predecessor: true,
          },
        },
        successors: {
          include: {
            successor: true,
          },
        },
        children: true,
      },
      orderBy: [
        { level: 'asc' },
        { wbsCode: 'asc' },
      ],
    });
  }

  async findOne(id: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id },
      include: {
        project: true,
        predecessors: {
          include: {
            predecessor: true,
          },
        },
        successors: {
          include: {
            successor: true,
          },
        },
        children: true,
        parent: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // If changing parent, recalculate level
    let level = task.level;
    if (updateTaskDto.parentId !== undefined && updateTaskDto.parentId !== task.parentId) {
      level = await this.calculateLevel(updateTaskDto.parentId, task.projectId);
    }

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: {
        ...updateTaskDto,
        level,
        ...(updateTaskDto.startDate && { startDate: new Date(updateTaskDto.startDate) }),
        ...(updateTaskDto.endDate && { endDate: new Date(updateTaskDto.endDate) }),
      },
      include: {
        predecessors: {
          include: {
            predecessor: true,
          },
        },
        successors: {
          include: {
            successor: true,
          },
        },
        children: true,
      },
    });

    return updatedTask;
  }

  async remove(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Check if task has children
    const childrenCount = await this.prisma.task.count({
      where: { parentId: id },
    });

    if (childrenCount > 0) {
      throw new BadRequestException('Cannot delete task with children. Delete children first.');
    }

    await this.prisma.task.delete({
      where: { id },
    });

    return { message: 'Task deleted successfully' };
  }

  async getWbsTree(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: {
        children: true,
        predecessors: {
          include: {
            predecessor: true,
          },
        },
        successors: {
          include: {
            successor: true,
          },
        },
      },
      orderBy: [
        { level: 'asc' },
        { wbsCode: 'asc' },
      ],
    });

    // Build hierarchical tree
    const taskMap = new Map();
    const rootTasks = [];

    // First pass: create map of all tasks
    tasks.forEach(task => {
      taskMap.set(task.id, { ...task, children: [] });
    });

    // Second pass: build hierarchy
    tasks.forEach(task => {
      if (task.parentId) {
        const parent = taskMap.get(task.parentId);
        if (parent) {
          parent.children.push(taskMap.get(task.id));
        }
      } else {
        rootTasks.push(taskMap.get(task.id));
      }
    });

    return rootTasks;
  }

  async getMilestones(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    return this.prisma.task.findMany({
      where: {
        projectId,
        isMilestone: true,
      },
      orderBy: [
        { startDate: 'asc' },
      ],
    });
  }
} 