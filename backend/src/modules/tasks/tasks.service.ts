import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  // Generate unique Activity ID with meaningful naming
  private async generateUniqueActivityId(projectId?: string, level?: number): Promise<string> {
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        let activityId: string;
        
        if (projectId && level !== undefined) {
          // Get project info for meaningful naming
          const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true }
          });
          
          if (project) {
            // Create project prefix from first 2-3 letters of project name
            const projectPrefix = project.name
              .toUpperCase()
              .replace(/[^A-Z]/g, '')
              .substring(0, 3)
              .padEnd(3, 'X');
            
            // Generate level-based suffix
            let suffix: string;
            if (level <= 2) {
              // High level tasks: PRJ-100, PRJ-200, etc.
              const existingHighLevel = await this.prisma.task.findMany({
                where: { 
                  projectId,
                  level: { lte: 2 },
                  activityId: { startsWith: projectPrefix }
                },
                select: { activityId: true },
                orderBy: { activityId: 'desc' }
              });
              
              let nextNumber = 100;
              if (existingHighLevel.length > 0) {
                const lastId = existingHighLevel[0].activityId;
                const match = lastId.match(/(\d+)$/);
                if (match) {
                  nextNumber = Math.max(100, parseInt(match[1]) + 100);
                }
              }
              suffix = nextNumber.toString();
            } else {
              // Lower level tasks: use timestamp-based for now to avoid complexity
              suffix = `${level}${Date.now().toString().slice(-4)}`;
            }
            
            activityId = `${projectPrefix}-${suffix}`;
          } else {
            // Fallback if project not found
            activityId = `TSK-${Date.now().toString().slice(-6)}-${attempt}`;
          }
        } else {
          // Fallback for calls without context
          activityId = `TSK-${Date.now().toString().slice(-6)}-${attempt}`;
        }

        // Verify this ID doesn't already exist
        const existingTask = await this.prisma.task.findFirst({
          where: { activityId },
          select: { id: true }
        });

        if (!existingTask) {
          return activityId;
        }

        // If ID exists, will retry with incremented attempt
      } catch (error) {
        console.warn(`Activity ID generation attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries - 1) {
          // Final fallback
          const prefix = projectId ? 'ERR' : 'TSK';
          return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        }
      }
    }

    // Final fallback
    return `TSK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
  }

  private calculateLevel(parentId: string | null, projectId: string): Promise<number> {
    // Level 0 is allowed for project root tasks (no parent)
    if (!parentId) return Promise.resolve(0);
    
    return this.prisma.task.findUnique({
      where: { id: parentId },
      select: { level: true },
    }).then(parent => {
      if (!parent) throw new BadRequestException('Parent task not found');
      if (parent.level >= 10) throw new BadRequestException('Cannot create tasks deeper than level 10');
      return parent.level + 1;
    });
  }

  private async validateWbsHierarchy(parentId: string | null, projectId: string, desiredLevel?: number): Promise<void> {
    // Level 0 tasks (project root) are always allowed
    if (!parentId) {
      // Ensure only one level 0 task per project
      const existingLevel0 = await this.prisma.task.findFirst({
        where: {
          projectId: projectId,
          level: 0,
        },
      });

      if (existingLevel0 && (!desiredLevel || desiredLevel === 0)) {
        throw new BadRequestException('Project already has a root-level WBS task (Level 0). Only one Level 0 task is allowed per project.');
      }
      return;
    }

    // Get the parent task
    const parent = await this.prisma.task.findFirst({
      where: {
        id: parentId,
        projectId: projectId,
      },
      select: { level: true },
    });

    if (!parent) {
      throw new BadRequestException('Parent task not found');
    }

    const childLevel = parent.level + 1;

    // If a desired level is specified, validate it matches the calculated level
    if (desiredLevel && desiredLevel !== childLevel) {
      throw new BadRequestException(`Invalid WBS level. Task with parent at level ${parent.level} must be at level ${childLevel}, but level ${desiredLevel} was specified.`);
    }

    // Additional validation: ensure the parent is actually at the level we expect
    if (parent.level !== childLevel - 1) {
      throw new BadRequestException(`Invalid parent relationship. Parent task is at level ${parent.level}, but child would be at level ${childLevel}.`);
    }
  }

  private async generateUniqueWbsCode(projectId: string, parentId: string | null): Promise<string> {
    if (!parentId) {
      // Root level task - find highest root number
      const rootTasks = await this.prisma.task.findMany({
        where: {
          projectId,
          parentId: null,
          level: { gte: 1 } // Exclude level 0 project root
        },
        select: { wbsCode: true },
        orderBy: { wbsCode: 'desc' }
      });

      // Find the highest root number
      let maxRoot = 0;
      for (const task of rootTasks) {
        const firstPart = parseInt(task.wbsCode.split('.')[0]);
        if (!isNaN(firstPart) && firstPart > maxRoot) {
          maxRoot = firstPart;
        }
      }

      return `${maxRoot + 1}`;
    }

    // Child task - get parent's WBS code and find highest child number
    const parent = await this.prisma.task.findUnique({
      where: { id: parentId },
      select: { wbsCode: true }
    });

    if (!parent) {
      throw new BadRequestException('Parent task not found');
    }

    // Find all existing children of this parent
    const siblings = await this.prisma.task.findMany({
      where: {
        projectId,
        parentId: parentId
      },
      select: { wbsCode: true },
      orderBy: { wbsCode: 'desc' }
    });

    const parentWbs = parent.wbsCode;
    let maxChild = 0;

    // Find the highest child number for this parent
    for (const sibling of siblings) {
      if (sibling.wbsCode.startsWith(`${parentWbs}.`)) {
        const childPart = sibling.wbsCode.substring(parentWbs.length + 1);
        const firstChildNumber = parseInt(childPart.split('.')[0]);
        if (!isNaN(firstChildNumber) && firstChildNumber > maxChild) {
          maxChild = firstChildNumber;
        }
      }
    }

    return `${parentWbs}.${maxChild + 1}`;
  }

  private async validateWbsCodeUniqueness(projectId: string, wbsCode: string, excludeTaskId?: string): Promise<void> {
    const existingTask = await this.prisma.task.findFirst({
      where: {
        projectId,
        wbsCode,
        ...(excludeTaskId && { id: { not: excludeTaskId } })
      },
      select: { id: true, title: true }
    });

    if (existingTask) {
      throw new BadRequestException(`WBS code "${wbsCode}" already exists in this project (used by task: "${existingTask.title}"). WBS codes must be unique within a project.`);
    }
  }

  // Calculate total cost for a task (direct costs only for leaf tasks)
  private calculateDirectCost(costLabor: number, costMaterial: number, costOther: number, roleHours?: Record<string, number>): Decimal {
    let laborCost = new Decimal(costLabor || 0);
    
    // If roleHours are provided (for level 4+ tasks), calculate labor cost from role hours
    if (roleHours && Object.keys(roleHours).length > 0) {
      laborCost = this.calculateLaborCostFromRoleHours(roleHours);
    }
    
    return laborCost
      .plus(new Decimal(costMaterial || 0))
      .plus(new Decimal(costOther || 0));
  }

  // Calculate labor cost from role-specific hours
  private calculateLaborCostFromRoleHours(roleHours: Record<string, number>): Decimal {
    // Define hourly rates for each role
    const hourlyRates: Record<string, number> = {
      'Business Analyst': 120,
      'Technical Writer': 100,
      'Project Manager': 180,
      'Solutions Architect': 200,
      'Developer': 150,
      'Designer': 120,
      'QA Engineer': 100,
      'DevOps Engineer': 170,
      'Data Analyst': 130,
      'UI/UX Designer': 140,
    };

    const defaultRate = 125; // Default rate for unknown roles

    let totalCost = new Decimal(0);
    
    for (const [role, hours] of Object.entries(roleHours)) {
      const rate = hourlyRates[role] || defaultRate;
      const roleCost = new Decimal(hours).times(new Decimal(rate));
      totalCost = totalCost.plus(roleCost);
    }
    
    return totalCost;
  }

  // Recursively calculate and update budget rollups for a task and its ancestors
  private async updateBudgetRollups(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        children: true,
        parent: true,
      },
    });

    if (!task) return;

    // Calculate total cost for this task
    let totalCost = new Decimal(0);

    // If this is a leaf task (no children), use direct costs
    if (task.children.length === 0) {
      totalCost = this.calculateDirectCost(
        Number(task.costLabor),
        Number(task.costMaterial),
        Number(task.costOther)
      );
    } else {
      // If this has children, sum up their total costs
      const childTasks = await this.prisma.task.findMany({
        where: { parentId: taskId },
        select: { totalCost: true },
      });

      totalCost = childTasks.reduce((sum, child) => {
        return sum.plus(new Decimal(child.totalCost.toString()));
      }, new Decimal(0));
    }

    // Update this task's total cost
    await this.prisma.task.update({
      where: { id: taskId },
      data: { totalCost },
    });

    // Update project-level budget rollup if this is the root task (level 0)
    if (task.level === 0) {
      await this.prisma.project.update({
        where: { id: task.projectId },
        data: { budgetRollup: totalCost },
      });
    }

    // Recursively update parent if it exists
    if (task.parentId) {
      await this.updateBudgetRollups(task.parentId);
    }
  }

  // Ensure every project has a WBS Level 0 root task
  async ensureProjectRootTask(projectId: string): Promise<void> {
    const existingRoot = await this.prisma.task.findFirst({
      where: {
        projectId: projectId,
        level: 0,
      },
    });

    if (!existingRoot) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, startDate: true, endDate: true },
      });

      if (project) {
        const activityId = await this.generateUniqueActivityId(projectId, 0);
        await this.prisma.task.create({
          data: {
            activityId,
            projectId: projectId,
            level: 0,
            wbsCode: '0',
            title: `${project.name} (Project Root)`,
            description: 'Project root-level WBS element',
            startDate: project.startDate,
            endDate: project.endDate,
            isMilestone: false,
            costLabor: new Decimal(0),
            costMaterial: new Decimal(0),
            costOther: new Decimal(0),
            totalCost: new Decimal(0),
          },
        });
      }
    }
  }

  async create(createTaskDto: CreateTaskDto, userId: string) {
    console.log('TasksService.create called with DTO:', createTaskDto);
    
    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, createTaskDto.projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Ensure project has a root task
    await this.ensureProjectRootTask(createTaskDto.projectId);

    // Calculate level based on parent
    const level = await this.calculateLevel(createTaskDto.parentId, createTaskDto.projectId);

    // Validate WBS hierarchy rules
    await this.validateWbsHierarchy(createTaskDto.parentId, createTaskDto.projectId, level);

    // Validate parent is in same project (if parent exists)
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

    // Generate unique WBS code server-side to prevent duplicates
    let wbsCode: string;
    if (createTaskDto.wbsCode) {
      // If frontend provides a WBS code, validate it's unique
      await this.validateWbsCodeUniqueness(createTaskDto.projectId, createTaskDto.wbsCode);
      wbsCode = createTaskDto.wbsCode;
    } else {
      // Generate unique WBS code server-side
      wbsCode = await this.generateUniqueWbsCode(createTaskDto.projectId, createTaskDto.parentId);
    }

    // Generate unique Activity ID
    const activityId = await this.generateUniqueActivityId(createTaskDto.projectId, level);

    // Calculate direct cost (with role hours if level 4+)
    const directCost = this.calculateDirectCost(
      createTaskDto.costLabor || 0,
      createTaskDto.costMaterial || 0,
      createTaskDto.costOther || 0,
      level >= 4 ? createTaskDto.roleHours : undefined
    );

    // Create taskData without spreading the DTO to avoid including fields that don't exist in DB
    const taskData = {
      projectId: createTaskDto.projectId,
      title: createTaskDto.title,
      description: createTaskDto.description || '',
      isMilestone: createTaskDto.isMilestone || false,
      resourceRole: createTaskDto.resourceRole || null,
      resourceQty: createTaskDto.resourceQty || null,
      resourceUnit: createTaskDto.resourceUnit || null,
      roleHours: createTaskDto.roleHours || null,
      parentId: createTaskDto.parentId || null,
      wbsCode, // Use server-generated or validated WBS code
      activityId,
      level,
      startDate: new Date(createTaskDto.startDate),
      endDate: new Date(createTaskDto.endDate),
      costLabor: new Decimal(createTaskDto.costLabor || 0),
      costMaterial: new Decimal(createTaskDto.costMaterial || 0),
      costOther: new Decimal(createTaskDto.costOther || 0),
      totalCost: directCost,
    };
    
    console.log('TasksService.create - Data to be saved to DB:', taskData);

    const task = await this.prisma.task.create({
      data: taskData,
      include: {
        predecessors: {
          include: {
            predecessor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        successors: {
          include: {
            successor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        children: true,
      },
    });

    console.log('TasksService.create - Task created with title:', task.title);

    // Update budget rollups
    await this.updateBudgetRollups(task.id);

    return task;
  }

  async findAll(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Ensure project has a root task
    await this.ensureProjectRootTask(projectId);

    return this.prisma.task.findMany({
      where: { projectId },
      include: {
        predecessors: {
          include: {
            predecessor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        successors: {
          include: {
            successor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
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
            predecessor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        successors: {
          include: {
            successor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
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

    // If changing parent, recalculate level and validate hierarchy
    let level = task.level;
    if (updateTaskDto.parentId !== undefined && updateTaskDto.parentId !== task.parentId) {
      level = await this.calculateLevel(updateTaskDto.parentId, task.projectId);
      // Validate WBS hierarchy rules for the new parent relationship
      await this.validateWbsHierarchy(updateTaskDto.parentId, task.projectId, level);
    }

    // If changing WBS code, validate uniqueness
    if (updateTaskDto.wbsCode && updateTaskDto.wbsCode !== task.wbsCode) {
      await this.validateWbsCodeUniqueness(task.projectId, updateTaskDto.wbsCode, task.id);
    }

    // Calculate new direct cost if cost fields are updated
    const updatedCostLabor = updateTaskDto.costLabor !== undefined ? updateTaskDto.costLabor : Number(task.costLabor);
    const updatedCostMaterial = updateTaskDto.costMaterial !== undefined ? updateTaskDto.costMaterial : Number(task.costMaterial);
    const updatedCostOther = updateTaskDto.costOther !== undefined ? updateTaskDto.costOther : Number(task.costOther);

    const newDirectCost = this.calculateDirectCost(
      updatedCostLabor, 
      updatedCostMaterial, 
      updatedCostOther,
      level >= 4 ? updateTaskDto.roleHours : undefined
    );

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: {
        ...updateTaskDto,
        level,
        ...(updateTaskDto.startDate && { startDate: new Date(updateTaskDto.startDate) }),
        ...(updateTaskDto.endDate && { endDate: new Date(updateTaskDto.endDate) }),
        ...(updateTaskDto.costLabor !== undefined && { costLabor: new Decimal(updateTaskDto.costLabor) }),
        ...(updateTaskDto.costMaterial !== undefined && { costMaterial: new Decimal(updateTaskDto.costMaterial) }),
        ...(updateTaskDto.costOther !== undefined && { costOther: new Decimal(updateTaskDto.costOther) }),
        totalCost: newDirectCost,
      },
      include: {
        predecessors: {
          include: {
            predecessor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        successors: {
          include: {
            successor: {
              select: {
                id: true,
                activityId: true,
                title: true,
                wbsCode: true,
              },
            },
          },
        },
        children: true,
      },
    });

    // Update budget rollups
    await this.updateBudgetRollups(updatedTask.id);

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

    // Prevent deletion of Level 0 (root) tasks
    if (task.level === 0) {
      throw new BadRequestException('Cannot delete the project root task (Level 0)');
    }

    // Check if task has children
    const childrenCount = await this.prisma.task.count({
      where: { parentId: id },
    });

    if (childrenCount > 0) {
      throw new BadRequestException('Cannot delete task with children. Delete children first.');
    }

    const parentId = task.parentId;

    await this.prisma.task.delete({
      where: { id },
    });

    // Update budget rollups for parent if it exists
    if (parentId) {
      await this.updateBudgetRollups(parentId);
    }

    return { message: 'Task deleted successfully' };
  }

  async getWbsTree(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Ensure project has a root task
    await this.ensureProjectRootTask(projectId);

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

  // New method to recalculate all budget rollups for a project
  async recalculateProjectBudgets(projectId: string, userId: string) {
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    // Find the root task (level 0)
    const rootTask = await this.prisma.task.findFirst({
      where: {
        projectId,
        level: 0,
      },
    });

    if (rootTask) {
      await this.updateBudgetRollups(rootTask.id);
    }

    return { message: 'Budget rollups recalculated successfully' };
  }
} 