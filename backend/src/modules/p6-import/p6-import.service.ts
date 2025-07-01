import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import * as xml2js from 'xml2js';

interface P6Project {
  proj_id: string;
  proj_name: string;
  start_date: string;
  end_date: string;
  budget: number;
}

interface P6Task {
  task_id: string;
  wbs_id: string;
  task_name: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
  parent_id?: string;
}

interface P6Relation {
  pred_task_id: string;
  succ_task_id: string;
  relation_type: string;
  lag_hr_cnt: number;
}

@Injectable()
export class P6ImportService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  // Generate unique Activity ID
  private async generateUniqueActivityId(): Promise<string> {
    // Find the highest existing Activity ID
    const lastTask = await this.prisma.task.findFirst({
      select: { activityId: true },
      orderBy: { activityId: 'desc' },
    });

    let nextNumber = 1010; // Default starting number
    if (lastTask?.activityId) {
      // Extract the number from the Activity ID (e.g., "A1270" -> 1270)
      const match = lastTask.activityId.match(/^A(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 10;
      }
    }

    return `A${nextNumber}`;
  }

  async importXERFile(fileBuffer: Buffer, projectId: string, userId: string) {
    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    try {
      const fileContent = fileBuffer.toString('utf-8');
      const parsedData = await this.parseXERContent(fileContent);
      
      // Import project data
      const project = await this.importProjectData(parsedData.project, projectId);
      
      // Import tasks
      const taskMap = await this.importTasks(parsedData.tasks, projectId);
      
      // Import relationships
      await this.importRelations(parsedData.relations, taskMap);

      return {
        message: 'P6 file imported successfully',
        project: project.name,
        tasksImported: Object.keys(taskMap).length,
        relationsImported: parsedData.relations.length,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to import P6 file: ${error.message}`);
    }
  }

  async importXMLFile(fileBuffer: Buffer, projectId: string, userId: string) {
    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    try {
      const fileContent = fileBuffer.toString('utf-8');
      const parsedData = await this.parseXMLContent(fileContent);
      
      // Import project data
      const project = await this.importProjectData(parsedData.project, projectId);
      
      // Import tasks
      const taskMap = await this.importTasks(parsedData.tasks, projectId);
      
      // Import relationships
      await this.importRelations(parsedData.relations, taskMap);

      return {
        message: 'P6 XML file imported successfully',
        project: project.name,
        tasksImported: Object.keys(taskMap).length,
        relationsImported: parsedData.relations.length,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to import P6 XML file: ${error.message}`);
    }
  }

  private async parseXERContent(content: string) {
    // Simple XER parser - in production, use a proper XER parser library
    const lines = content.split('\n');
    const project: P6Project = {
      proj_id: '',
      proj_name: '',
      start_date: '',
      end_date: '',
      budget: 0,
    };
    const tasks: P6Task[] = [];
    const relations: P6Relation[] = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts[0] === 'PROJECT') {
        project.proj_id = parts[1] || '';
        project.proj_name = parts[2] || '';
        project.start_date = parts[3] || '';
        project.end_date = parts[4] || '';
        project.budget = parseFloat(parts[5] || '0');
      } else if (parts[0] === 'TASK') {
        tasks.push({
          task_id: parts[1] || '',
          wbs_id: parts[2] || '',
          task_name: parts[3] || '',
          start_date: parts[4] || '',
          end_date: parts[5] || '',
          is_milestone: parts[6] === 'Y',
          parent_id: parts[7] || undefined,
        });
      } else if (parts[0] === 'TASKPRED') {
        relations.push({
          pred_task_id: parts[1] || '',
          succ_task_id: parts[2] || '',
          relation_type: parts[3] || 'FS',
          lag_hr_cnt: parseFloat(parts[4] || '0'),
        });
      }
    }

    return { project, tasks, relations };
  }

  private async parseXMLContent(content: string) {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(content);
    
    // Extract project data from XML
    const projectData = result.project || {};
    const project: P6Project = {
      proj_id: projectData.id?.[0] || '',
      proj_name: projectData.name?.[0] || '',
      start_date: projectData.start_date?.[0] || '',
      end_date: projectData.end_date?.[0] || '',
      budget: parseFloat(projectData.budget?.[0] || '0'),
    };

    // Extract tasks
    const tasks: P6Task[] = [];
    const xmlTasks = result.project?.tasks?.[0]?.task || [];
    for (const xmlTask of xmlTasks) {
      tasks.push({
        task_id: xmlTask.id?.[0] || '',
        wbs_id: xmlTask.wbs_id?.[0] || '',
        task_name: xmlTask.name?.[0] || '',
        start_date: xmlTask.start_date?.[0] || '',
        end_date: xmlTask.end_date?.[0] || '',
        is_milestone: xmlTask.is_milestone?.[0] === 'true',
        parent_id: xmlTask.parent_id?.[0] || undefined,
      });
    }

    // Extract relations
    const relations: P6Relation[] = [];
    const xmlRelations = result.project?.relations?.[0]?.relation || [];
    for (const xmlRelation of xmlRelations) {
      relations.push({
        pred_task_id: xmlRelation.pred_task_id?.[0] || '',
        succ_task_id: xmlRelation.succ_task_id?.[0] || '',
        relation_type: xmlRelation.relation_type?.[0] || 'FS',
        lag_hr_cnt: parseFloat(xmlRelation.lag_hr_cnt?.[0] || '0'),
      });
    }

    return { project, tasks, relations };
  }

  private async importProjectData(p6Project: P6Project, projectId: string) {
    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: p6Project.proj_name || 'Imported Project',
        startDate: p6Project.start_date ? new Date(p6Project.start_date) : new Date(),
        endDate: p6Project.end_date ? new Date(p6Project.end_date) : new Date(),
        budget: p6Project.budget || 0,
      },
    });
  }

  private async importTasks(p6Tasks: P6Task[], projectId: string) {
    const taskMap = new Map<string, string>(); // P6 task ID -> our task ID

    // First pass: create all tasks
    for (const p6Task of p6Tasks) {
      const activityId = await this.generateUniqueActivityId();
      const task = await this.prisma.task.create({
        data: {
          activityId,
          projectId,
          wbsCode: p6Task.wbs_id || p6Task.task_id,
          title: p6Task.task_name,
          startDate: p6Task.start_date ? new Date(p6Task.start_date) : new Date(),
          endDate: p6Task.end_date ? new Date(p6Task.end_date) : new Date(),
          isMilestone: p6Task.is_milestone || false,
          level: 1, // Will be calculated in second pass
        },
      });
      taskMap.set(p6Task.task_id, task.id);
    }

    // Second pass: update parent relationships and levels
    for (const p6Task of p6Tasks) {
      if (p6Task.parent_id && taskMap.has(p6Task.parent_id)) {
        const parentLevel = await this.prisma.task.findUnique({
          where: { id: taskMap.get(p6Task.parent_id) },
          select: { level: true },
        });

        if (parentLevel && parentLevel.level < 10) {
          await this.prisma.task.update({
            where: { id: taskMap.get(p6Task.task_id) },
            data: {
              parentId: taskMap.get(p6Task.parent_id),
              level: parentLevel.level + 1,
            },
          });
        }
      }
    }

    return taskMap;
  }

  private async importRelations(p6Relations: P6Relation[], taskMap: Map<string, string>) {
    for (const p6Relation of p6Relations) {
      const predecessorId = taskMap.get(p6Relation.pred_task_id);
      const successorId = taskMap.get(p6Relation.succ_task_id);

      if (predecessorId && successorId && predecessorId !== successorId) {
        try {
          await this.prisma.taskRelation.create({
            data: {
              predecessorId,
              successorId,
              type: this.mapRelationType(p6Relation.relation_type),
              lag: p6Relation.lag_hr_cnt * 60, // Convert hours to minutes
            },
          });
        } catch (error) {
          // Skip duplicate relations
          console.log(`Skipping duplicate relation: ${p6Relation.pred_task_id} -> ${p6Relation.succ_task_id}`);
        }
      }
    }
  }

  private mapRelationType(p6Type: string): 'FS' | 'SS' | 'FF' | 'SF' {
    switch (p6Type.toUpperCase()) {
      case 'SS':
        return 'SS';
      case 'FF':
        return 'FF';
      case 'SF':
        return 'SF';
      default:
        return 'FS';
    }
  }
} 