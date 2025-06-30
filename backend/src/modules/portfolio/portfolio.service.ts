import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PortfolioService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getPortfolioWBS(userId: string) {
    // Get all projects the user has access to
    const userProjects = await this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        tasks: {
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
        },
      },
    });

    // Create portfolio root node
    const portfolioRoot = {
      id: 'portfolio-root',
      title: 'Portfolio',
      level: 0,
      wbsCode: '0',
      isMilestone: false,
      startDate: null,
      endDate: null,
      projectId: null,
      children: [],
      predecessors: [],
      successors: [],
    };

    // Build hierarchical structure for each project
    for (const project of userProjects) {
      const projectNode = {
        id: `project-${project.id}`,
        title: project.name,
        level: 1,
        wbsCode: project.id,
        isMilestone: false,
        startDate: project.startDate,
        endDate: project.endDate,
        projectId: project.id,
        project: {
          id: project.id,
          name: project.name,
          client: project.client,
        },
        children: [],
        predecessors: [],
        successors: [],
      };

      // Build task hierarchy for this project
      const taskMap = new Map();
      const rootTasks = [];

      // First pass: create map of all tasks
      project.tasks.forEach(task => {
        taskMap.set(task.id, { ...task, children: [] });
      });

      // Second pass: build hierarchy
      project.tasks.forEach(task => {
        if (task.parentId) {
          const parent = taskMap.get(task.parentId);
          if (parent) {
            parent.children.push(taskMap.get(task.id));
          }
        } else {
          rootTasks.push(taskMap.get(task.id));
        }
      });

      projectNode.children = rootTasks;
      portfolioRoot.children.push(projectNode);
    }

    return portfolioRoot;
  }

  async getPortfolioSummary(userId: string) {
    const userProjects = await this.prisma.project.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
        tasks: {
          where: {
            isMilestone: true,
          },
          select: {
            id: true,
            title: true,
            startDate: true,
            endDate: true,
          },
        },
      },
    });

    const totalProjects = userProjects.length;
    const totalTasks = userProjects.reduce((sum, project) => sum + project._count.tasks, 0);
    const totalMilestones = userProjects.reduce((sum, project) => sum + project.tasks.length, 0);
    
    // Handle Decimal budget properly - convert to number for calculation
    const totalBudget = userProjects.reduce((sum, project) => {
      const projectBudget = project.budget ? Number(project.budget.toString()) : 0;
      return sum + projectBudget;
    }, 0);

    // Calculate date ranges
    const allDates = userProjects.flatMap(project => [
      project.startDate,
      project.endDate,
    ]).filter(date => date);

    const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
    const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;

    return {
      totalProjects,
      totalTasks,
      totalMilestones,
      totalBudget,
      dateRange: {
        start: earliestDate,
        end: latestDate,
      },
      projects: userProjects.map(project => ({
        id: project.id,
        name: project.name,
        client: project.client,
        startDate: project.startDate,
        endDate: project.endDate,
        budget: project.budget ? Number(project.budget.toString()) : 0, // Convert Decimal to number for API response
        taskCount: project._count.tasks,
        milestoneCount: project.tasks.length,
      })),
    };
  }
} 