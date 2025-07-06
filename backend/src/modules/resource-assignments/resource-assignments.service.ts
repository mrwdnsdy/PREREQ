import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMultiAssignmentDto } from './dto/create-multi-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Injectable()
export class ResourceAssignmentsService {
  constructor(private prisma: PrismaService) {}

  async createMultipleAssignments(taskId: string, createMultiAssignmentDto: CreateMultiAssignmentDto) {
    // Verify task exists
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Extract resource IDs for validation
    const resourceIds = createMultiAssignmentDto.assignments.map(a => a.resourceId);

    // Verify all resources exist
    const resources = await this.prisma.resource.findMany({
      where: { id: { in: resourceIds } },
    });

    if (resources.length !== resourceIds.length) {
      const foundIds = resources.map(r => r.id);
      const missingIds = resourceIds.filter(id => !foundIds.includes(id));
      throw new NotFoundException(`Resources not found: ${missingIds.join(', ')}`);
    }

    // Check for existing assignments to prevent duplicates
    const existingAssignments = await this.prisma.resourceAssignment.findMany({
      where: {
        taskId,
        resourceId: { in: resourceIds },
      },
    });

    if (existingAssignments.length > 0) {
      const existingResourceIds = existingAssignments.map(a => a.resourceId);
      const duplicateResources = resources.filter(r => existingResourceIds.includes(r.id));
      throw new ConflictException(
        `Resources already assigned to this task: ${duplicateResources.map(r => r.name).join(', ')}`
      );
    }

    // Create all assignments in a transaction
    const assignments = createMultiAssignmentDto.assignments.map(assignment => ({
      taskId,
      resourceId: assignment.resourceId,
      hours: assignment.hours,
    }));

    const createdAssignments = await this.prisma.$transaction(
      assignments.map(assignment =>
        this.prisma.resourceAssignment.create({
          data: assignment,
          include: {
            resource: {
              include: {
                type: true,
              },
            },
            task: {
              select: {
                id: true,
                title: true,
                activityId: true,
                wbsCode: true,
              },
            },
          },
        })
      )
    );

    return createdAssignments;
  }

  async findTaskAssignments(taskId: string) {
    // Verify task exists
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        activityId: true,
        wbsCode: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const assignments = await this.prisma.resourceAssignment.findMany({
      where: { taskId },
      include: {
        resource: {
          include: {
            type: true,
          },
        },
      },
      orderBy: [
        { resource: { type: { name: 'asc' } } },
        { resource: { name: 'asc' } },
      ],
    });

    return {
      task,
      assignments,
    };
  }

  async findOneAssignment(id: string) {
    const assignment = await this.prisma.resourceAssignment.findUnique({
      where: { id },
      include: {
        resource: {
          include: {
            type: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            activityId: true,
            wbsCode: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }

  async updateAssignment(id: string, updateAssignmentDto: UpdateAssignmentDto) {
    const assignment = await this.prisma.resourceAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return await this.prisma.resourceAssignment.update({
      where: { id },
      data: updateAssignmentDto,
      include: {
        resource: {
          include: {
            type: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            activityId: true,
            wbsCode: true,
          },
        },
      },
    });
  }

  async deleteAssignment(id: string) {
    const assignment = await this.prisma.resourceAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return await this.prisma.resourceAssignment.delete({
      where: { id },
    });
  }

  async getAvailableResources(taskId: string, typeId?: string) {
    // Verify task exists
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Get already assigned resource IDs for this task
    const assignedResourceIds = await this.prisma.resourceAssignment.findMany({
      where: { taskId },
      select: { resourceId: true },
    });

    const excludeResourceIds = assignedResourceIds.map(a => a.resourceId);

    // Build where clause
    const where: any = {
      id: { notIn: excludeResourceIds },
    };

    if (typeId) {
      where.typeId = typeId;
    }

    return await this.prisma.resource.findMany({
      where,
      include: {
        type: true,
      },
      orderBy: [
        { type: { name: 'asc' } },
        { name: 'asc' },
      ],
    });
  }
} 