import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportScheduleDto, ImportTaskRowDto } from './dto/import-schedule.dto';
import { Decimal } from '@prisma/client/runtime/library';

interface WbsNode {
  level: number;
  activityId: string;
  title: string;
  children: WbsNode[];
  parent?: WbsNode;
  wbsCode: string;
  originalRow: ImportTaskRowDto;
}

@Injectable()
export class ScheduleImportService {
  constructor(private prisma: PrismaService) {}

  async importSchedule(importDto: ImportScheduleDto, userId: string) {
    console.log('Starting schedule import for project:', importDto.projectId);
    
    // Validate project exists and user has access
    const project = await this.prisma.project.findUnique({
      where: { id: importDto.projectId },
      include: {
        members: {
          where: { userId: userId }
        }
      }
    });

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    if (project.members.length === 0) {
      throw new BadRequestException('Insufficient permissions for this project');
    }

    // Clear existing tasks if replace option is enabled
    if (importDto.options?.replaceExisting) {
      await this.clearExistingTasks(importDto.projectId);
    }

    // Build WBS hierarchy from flat structure
    const wbsTree = this.buildWbsHierarchy(importDto.tasks);
    
    // Generate WBS codes if needed
    if (importDto.options?.generateWbsCodes) {
      this.generateWbsCodes(wbsTree);
    }

    // Create tasks in database
    const createdTasks = await this.createTasksFromTree(wbsTree, importDto.projectId);

    // Create relationships (predecessors)
    if (importDto.options?.validateDependencies !== false) {
      await this.createTaskRelationships(importDto.tasks, createdTasks);
    }

    // Update budget rollups
    await this.updateBudgetRollups(importDto.projectId);

    return {
      success: true,
      importedTasks: createdTasks.length,
      message: `Successfully imported ${createdTasks.length} tasks`
    };
  }

  private buildWbsHierarchy(tasks: ImportTaskRowDto[]): WbsNode[] {
    console.log('Building WBS hierarchy from', tasks.length, 'tasks');
    
    // Sort tasks by level and activity ID to ensure proper order
    const sortedTasks = tasks.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.activityId.localeCompare(b.activityId);
    });

    const nodeMap = new Map<string, WbsNode>();
    const rootNodes: WbsNode[] = [];

    // Create nodes for all tasks
    for (const task of sortedTasks) {
      const node: WbsNode = {
        level: task.level,
        activityId: task.activityId,
        title: task.description,
        children: [],
        wbsCode: '', // Will be generated
        originalRow: task
      };
      
      nodeMap.set(task.activityId, node);
    }

    // Build parent-child relationships based on levels
    for (const task of sortedTasks) {
      const currentNode = nodeMap.get(task.activityId)!;
      
      if (task.level === 1) {
        // Level 1 tasks are root nodes
        rootNodes.push(currentNode);
      } else {
        // Find parent (previous task with level - 1)
        const parentLevel = task.level - 1;
        let parent: WbsNode | undefined;
        
        // Look backwards for the nearest task at parent level
        const currentIndex = sortedTasks.findIndex(t => t.activityId === task.activityId);
        for (let i = currentIndex - 1; i >= 0; i--) {
          const candidateTask = sortedTasks[i];
          if (candidateTask.level === parentLevel) {
            parent = nodeMap.get(candidateTask.activityId);
            break;
          }
          if (candidateTask.level < parentLevel) {
            // We've gone too far back
            break;
          }
        }

        if (parent) {
          currentNode.parent = parent;
          parent.children.push(currentNode);
        } else {
          // If no parent found, treat as root
          rootNodes.push(currentNode);
        }
      }
    }

    return rootNodes;
  }

  private generateWbsCodes(nodes: WbsNode[], parentCode = '') {
    let counter = 1;
    
    for (const node of nodes) {
      if (parentCode) {
        node.wbsCode = `${parentCode}.${counter}`;
      } else {
        node.wbsCode = `${counter}`;
      }
      
      if (node.children.length > 0) {
        this.generateWbsCodes(node.children, node.wbsCode);
      }
      
      counter++;
    }
  }

  private async createTasksFromTree(nodes: WbsNode[], projectId: string): Promise<any[]> {
    const createdTasks: any[] = [];
    
    // Create project root if doesn't exist
    await this.ensureProjectRoot(projectId);
    
    for (const node of nodes) {
      const tasks = await this.createNodeAndChildren(node, projectId, null);
      createdTasks.push(...tasks);
    }
    
    return createdTasks;
  }

  private async createNodeAndChildren(node: WbsNode, projectId: string, parentId: string | null): Promise<any[]> {
    const createdTasks: any[] = [];
    
    // Parse resource information
    const { resourceRole, resourceQty, roleHours } = this.parseResourceInfo(node.originalRow.resourcing, node.level);
    
    // Calculate dates with better error handling
    let startDate: Date;
    let endDate: Date;
    
    try {
      // Parse start date with fallback to current date
      if (node.originalRow.startDate && node.originalRow.startDate.trim() !== '') {
        startDate = new Date(node.originalRow.startDate);
        // Check if date is invalid
        if (isNaN(startDate.getTime())) {
          console.warn(`Invalid start date "${node.originalRow.startDate}" for task ${node.activityId}, using current date`);
          startDate = new Date();
        }
      } else {
        startDate = new Date();
      }

      // Parse end date with fallbacks
      if (node.originalRow.finishDate && node.originalRow.finishDate.trim() !== '') {
        endDate = new Date(node.originalRow.finishDate);
        // Check if date is invalid
        if (isNaN(endDate.getTime())) {
          console.warn(`Invalid finish date "${node.originalRow.finishDate}" for task ${node.activityId}, calculating from duration`);
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + (node.originalRow.duration || 1));
        }
      } else if (node.originalRow.duration && node.originalRow.duration > 0) {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + node.originalRow.duration - 1);
      } else {
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }

      // Ensure end date is not before start date
      if (endDate < startDate) {
        console.warn(`End date before start date for task ${node.activityId}, adjusting`);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
      }
    } catch (error) {
      console.error(`Error parsing dates for task ${node.activityId}:`, error);
      // Fallback to reasonable default dates
      startDate = new Date();
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    }

    // Generate unique activity ID if not provided or ensure uniqueness
    let activityId = node.activityId;
    if (!activityId || activityId.trim() === '') {
      activityId = await this.generateUniqueActivityId(projectId, node.level, node.wbsCode);
    } else {
      // Check if activity ID already exists and make it unique if needed
      const existingTask = await this.prisma.task.findFirst({
        where: { activityId: activityId }
      });
      if (existingTask) {
        console.warn(`Activity ID ${activityId} already exists, generating new one`);
        activityId = await this.generateUniqueActivityId(projectId, node.level, node.wbsCode);
      }
    }

    try {
      // Create the task
      const task = await this.prisma.task.create({
        data: {
          activityId: activityId,
          projectId: projectId,
          parentId: parentId,
          level: node.level,
          wbsCode: node.wbsCode || activityId,
          title: node.title || `Task ${activityId}`,
          description: node.originalRow.notes || node.title || `Level ${node.level} task: ${node.title}`,
          startDate: startDate,
          endDate: endDate,
          isMilestone: node.originalRow.type?.toLowerCase() === 'milestone' || false,
          costLabor: new Decimal(node.originalRow.budget || 0),
          costMaterial: new Decimal(0),
          costOther: new Decimal(0),
          totalCost: new Decimal(node.originalRow.budget || 0),
          resourceRole: resourceRole,
          resourceQty: resourceQty,
          resourceUnit: resourceQty ? 'hours/day' : null,
          roleHours: roleHours
        }
      });

      createdTasks.push(task);
      console.log(`Created task: ${task.activityId} - ${task.title} (Level ${task.level})`);

      // Create children
      for (const child of node.children) {
        const childTasks = await this.createNodeAndChildren(child, projectId, task.id);
        createdTasks.push(...childTasks);
      }

    } catch (error) {
      console.error(`Failed to create task ${activityId}:`, error);
      // Skip this task and continue with others
      console.warn(`Skipping task ${activityId} due to creation error`);
    }

    return createdTasks;
  }

  private parseResourceInfo(resourcing: string | undefined, level: number): {
    resourceRole: string | null;
    resourceQty: number | null;
    roleHours: any | null;
  } {
    if (!resourcing || level < 4) {
      return { resourceRole: null, resourceQty: null, roleHours: null };
    }

    // Parse various formats:
    // "Developer 1.5" -> Developer role, 1.5 quantity
    // "PM (2.0)" -> PM role, 2.0 quantity  
    // "Developer: 16h, Designer: 8h" -> Role hours format
    
    if (resourcing.includes(':') && resourcing.includes('h')) {
      // Role hours format: "Developer: 16h, Designer: 8h"
      const roleHours: Record<string, number> = {};
      const parts = resourcing.split(',');
      
      for (const part of parts) {
        const match = part.trim().match(/(.+?):\s*(\d+(?:\.\d+)?)h?/);
        if (match) {
          const role = match[1].trim();
          const hours = parseFloat(match[2]);
          roleHours[role] = hours;
        }
      }
      
      return {
        resourceRole: Object.keys(roleHours)[0] || null,
        resourceQty: Object.values(roleHours)[0] || null,
        roleHours: Object.keys(roleHours).length > 0 ? roleHours : null
      };
    } else {
      // Legacy format: "Developer 1.5" or "PM (2.0)"
      const match = resourcing.match(/(.+?)\s*[\(\s]+(\d+(?:\.\d+)?)/);
      if (match) {
        return {
          resourceRole: match[1].trim(),
          resourceQty: parseFloat(match[2]),
          roleHours: null
        };
      }
      
      // Just role name
      return {
        resourceRole: resourcing.trim(),
        resourceQty: 1.0,
        roleHours: null
      };
    }
  }

  private async createTaskRelationships(tasks: ImportTaskRowDto[], createdTasks: any[]) {
    console.log('Creating task relationships...');
    
    const activityMap = new Map(createdTasks.map(task => [task.activityId, task]));
    
    for (const taskRow of tasks) {
      if (!taskRow.predecessors) continue;
      
      const currentTask = activityMap.get(taskRow.activityId);
      if (!currentTask) continue;
      
      const predecessorIds = taskRow.predecessors.split(',').map(id => id.trim());
      
      for (const predId of predecessorIds) {
        const predecessorTask = activityMap.get(predId);
        if (!predecessorTask) {
          console.warn(`Predecessor ${predId} not found for task ${taskRow.activityId}`);
          continue;
        }
        
        try {
          await this.prisma.taskRelation.create({
            data: {
              predecessorId: predecessorTask.id,
              successorId: currentTask.id,
              type: 'FS', // Finish-to-Start
              lag: 0
            }
          });
          console.log(`Created relationship: ${predId} -> ${taskRow.activityId}`);
        } catch (error) {
          console.warn(`Failed to create relationship ${predId} -> ${taskRow.activityId}:`, error);
        }
      }
    }
  }

  private async ensureProjectRoot(projectId: string) {
    const existingRoot = await this.prisma.task.findFirst({
      where: {
        projectId: projectId,
        level: 0
      }
    });

    if (!existingRoot) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, startDate: true, endDate: true }
      });

      if (project) {
        await this.prisma.task.create({
          data: {
            activityId: await this.generateUniqueActivityId(projectId, 0, ''),
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
            totalCost: new Decimal(0)
          }
        });
      }
    }
  }

  private async generateUniqueActivityId(projectId?: string, level?: number, parentWbs?: string): Promise<string> {
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        let activityId: string;
        
        if (projectId && level !== undefined) {
          // Generate meaningful activity ID based on project and hierarchy
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
              // Lower level tasks: PRJ-101-001, PRJ-101-002, etc.
              const parentTasks = await this.prisma.task.findMany({
                where: { 
                  projectId,
                  level: level - 1,
                  activityId: { startsWith: projectPrefix }
                },
                select: { activityId: true, wbsCode: true }
              });
              
              // Find appropriate parent based on WBS hierarchy
              const parentTask = parentTasks.find(t => 
                parentWbs ? parentWbs.startsWith(t.wbsCode) : true
              ) || parentTasks[0];
              
              if (parentTask) {
                const parentSuffix = parentTask.activityId.split('-').pop() || '100';
                
                // Find existing children
                const existingChildren = await this.prisma.task.findMany({
                  where: { 
                    projectId,
                    activityId: { 
                      startsWith: `${projectPrefix}-${parentSuffix}-`
                    }
                  },
                  select: { activityId: true },
                  orderBy: { activityId: 'desc' }
                });
                
                let childNumber = 1;
                if (existingChildren.length > 0) {
                  const lastChild = existingChildren[0].activityId;
                  const match = lastChild.match(/(\d+)$/);
                  if (match) {
                    childNumber = parseInt(match[1]) + 1;
                  }
                }
                
                suffix = `${parentSuffix}-${childNumber.toString().padStart(3, '0')}`;
              } else {
                // Fallback for orphaned tasks
                suffix = `${(level * 100 + attempt + 1).toString().padStart(3, '0')}`;
              }
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
          // Final fallback: use timestamp-based ID with project info if available
          const prefix = projectId ? 'ERR' : 'TSK';
          return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
        }
      }
    }

    // Final fallback
    return `TSK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
  }

  private async clearExistingTasks(projectId: string) {
    console.log('Clearing existing tasks for project:', projectId);
    
    // Delete relationships first
    await this.prisma.taskRelation.deleteMany({
      where: {
        OR: [
          { predecessor: { projectId } },
          { successor: { projectId } }
        ]
      }
    });
    
    // Delete tasks
    await this.prisma.task.deleteMany({
      where: { projectId }
    });
  }

  private async updateBudgetRollups(projectId: string) {
    console.log('Updating budget rollups...');
    
    // Get all tasks ordered by level (deepest first)
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: { level: 'desc' }
    });

    const processedTasks = new Set<string>();

    for (const task of tasks) {
      if (processedTasks.has(task.id)) continue;

      // If this is a leaf task (no children), its cost is already set
      const children = await this.prisma.task.findMany({
        where: { parentId: task.id },
        select: { totalCost: true }
      });

      if (children.length > 0) {
        // Calculate rollup cost from children
        const rollupCost = children.reduce((sum, child) => {
          return sum.plus(new Decimal(child.totalCost.toString()));
        }, new Decimal(0));

        await this.prisma.task.update({
          where: { id: task.id },
          data: { totalCost: rollupCost }
        });
      }

      processedTasks.add(task.id);
    }

    // Update project budget rollup
    const rootTask = await this.prisma.task.findFirst({
      where: { projectId, level: 0 },
      select: { totalCost: true }
    });

    if (rootTask) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { budgetRollup: rootTask.totalCost }
      });
    }
  }
} 