import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuthService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async create(createProjectDto: CreateProjectDto, userId: string) {
    const project = await this.prisma.project.create({
      data: {
        ...createProjectDto,
        startDate: new Date(createProjectDto.startDate),
        endDate: new Date(createProjectDto.endDate),
        budget: createProjectDto.budget ? new Decimal(createProjectDto.budget) : null,
        budgetRollup: new Decimal(0),
      },
    });

    // Add creator as PM
    await this.prisma.projectMember.create({
      data: {
        userId,
        projectId: project.id,
        role: 'PM',
      },
    });

    // Create WBS Level 0 (project root) task
    await this.prisma.task.create({
      data: {
        projectId: project.id,
        level: 0,
        wbsCode: '0',
        title: `${project.name} (Project Root)`,
        description: 'Project root-level WBS element - all project work rolls up to this level',
        startDate: project.startDate,
        endDate: project.endDate,
        isMilestone: false,
        costLabor: new Decimal(0),
        costMaterial: new Decimal(0),
        costOther: new Decimal(0),
        totalCost: new Decimal(0),
      },
    });

    return project;
  }

  async findAll(userId: string) {
    return this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        },
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
        },
        tasks: {
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
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, id, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...updateProjectDto,
        ...(updateProjectDto.startDate && { startDate: new Date(updateProjectDto.startDate) }),
        ...(updateProjectDto.endDate && { endDate: new Date(updateProjectDto.endDate) }),
        ...(updateProjectDto.budget !== undefined && { 
          budget: updateProjectDto.budget ? new Decimal(updateProjectDto.budget) : null 
        }),
      },
    });

    return project;
  }

  async remove(id: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, id, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    await this.prisma.project.delete({
      where: { id },
    });

    return { message: 'Project deleted successfully' };
  }

  async addMember(projectId: string, userId: string, memberUserId: string, role: 'ADMIN' | 'PM' | 'VIEWER') {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return this.prisma.projectMember.create({
      data: {
        userId: memberUserId,
        projectId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  }

  async removeMember(projectId: string, userId: string, memberUserId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions');
    }

    await this.prisma.projectMember.delete({
      where: {
        userId_projectId: {
          userId: memberUserId,
          projectId,
        },
      },
    });

    return { message: 'Member removed successfully' };
  }
} 