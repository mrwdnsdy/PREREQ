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

  // Generate unique Activity ID with meaningful naming
  private async generateUniqueActivityId(projectName?: string): Promise<string> {
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        let activityId: string;
        
        if (projectName) {
          // Create project prefix from first 2-3 letters of project name
          const projectPrefix = projectName
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .substring(0, 3)
            .padEnd(3, 'X');
          
          // Root task gets -000 suffix
          activityId = `${projectPrefix}-000`;
          
          // If this exists, increment
          let counter = 0;
          while (counter < 999) {
            const testId = `${projectPrefix}-${counter.toString().padStart(3, '0')}`;
            const existingTask = await this.prisma.task.findFirst({
              where: { activityId: testId },
              select: { id: true }
            });
            
            if (!existingTask) {
              activityId = testId;
              break;
            }
            counter++;
          }
        } else {
          // Fallback for calls without project name
          activityId = `ROOT-${Date.now().toString().slice(-6)}-${attempt}`;
        }

        // Final verification
        const existingTask = await this.prisma.task.findFirst({
          where: { activityId },
          select: { id: true }
        });

        if (!existingTask) {
          return activityId;
        }

        // If still exists after all attempts, use fallback
        if (attempt === maxRetries - 1) {
          return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        }
      } catch (error) {
        console.warn(`Activity ID generation attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries - 1) {
          // Final fallback
          return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        }
      }
    }

    // Final fallback
    return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
  }

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

    // Add creator as ADMIN (full permissions including delete)
    await this.prisma.projectMember.create({
      data: {
        userId,
        projectId: project.id,
        role: 'ADMIN',
      },
    });

    // Create WBS Level 0 (project root) task
    const activityId = await this.generateUniqueActivityId(project.name);
    await this.prisma.task.create({
      data: {
        activityId,
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

  async getUserProjectRole(userId: string, projectId: string) {
    return this.prisma.projectMember.findFirst({
      where: {
        userId,
        projectId,
      },
      select: {
        role: true,
      },
    });
  }

  async remove(id: string) {
    // Start a transaction to ensure all related data is deleted
    return await this.prisma.$transaction(async (prisma) => {
      // Delete task relations first (foreign key constraints)
      await prisma.taskRelation.deleteMany({
        where: {
          OR: [
            { predecessor: { projectId: id } },
            { successor: { projectId: id } },
          ],
        },
      });

      // Delete all tasks in the project
      await prisma.task.deleteMany({
        where: { projectId: id },
      });

      // Delete project members
      await prisma.projectMember.deleteMany({
        where: { projectId: id },
      });

      // Finally delete the project
      const deletedProject = await prisma.project.delete({
        where: { id },
      });

      return { 
        message: 'Project and all related data deleted successfully',
        deletedProject 
      };
    });
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