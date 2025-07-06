import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TasksService } from '../tasks/tasks.service';
import * as xml2js from 'xml2js';
import * as XLSX from 'xlsx';

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

// Enhanced interface for Excel template import
interface ExcelTaskRow {
  // Basic task info
  level?: number;
  id?: string;
  description?: string;
  type?: string;
  plannedDuration?: string;
  startDate?: string;
  finishDate?: string;
  
  // Dependencies
  predecessor?: string;
  successor?: string;
  remainingDuration?: string;
  
  // Dates
  baselineStartDate?: string;
  baselineFinishDate?: string;
  
  // Resource assignments
  accountableDesignation?: string;
  responsiblePersonnel?: string;
  projectManager?: string;
  flag?: string;
  
  // Resource hours by role
  juniorDesign?: number;
  intermediateDesign?: number;
  seniorDesign?: number;
  budget?: number;
  
  // Additional fields for parsing
  [key: string]: any;
}

interface ParsedExcelData {
  project: {
    name: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
  };
  tasks: ExcelTaskRow[];
  resourceTypes: Set<string>;
  resources: Map<string, { name: string; type: string; rate: number }>;
  assignments: Array<{
    taskId: string;
    resourceName: string;
    hours: number;
  }>;
}

@Injectable()
export class P6ImportService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private tasksService: TasksService,
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

  private async generateBatchActivityIds(count: number): Promise<string[]> {
    // Find the highest existing Activity ID (lexical order is unreliable past 4 digits, so extract numeric part)
    const lastTask = await this.prisma.task.findFirst({
      select: { activityId: true },
      where: {
        activityId: {
          startsWith: "A"
        }
      },
      orderBy: {
        // Order by numeric value extracted from the string so we can reliably get the max
        // Postgres does not support regex ordering easily, so we just order by activityId desc and fall back
        activityId: 'desc'
      },
    });

    // Default starting number – leave some room below the seed data (which currently ends at ~A9990)
    let nextNumber = 1010;
    if (lastTask?.activityId) {
      const match = lastTask.activityId.match(/^A(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 10;
      }
    }

    const activityIds: string[] = [];

    for (let i = 0; i < count; i++) {
      let candidateNumber = nextNumber + i * 10;
      let candidateId = `A${candidateNumber}`;

      // Ensure the candidate is unique in DB (edge-case safety)
      // eslint-disable-next-line no-await-in-loop
      while (await this.prisma.task.findFirst({ where: { activityId: candidateId }, select: { id: true } })) {
        candidateNumber += 10;
        candidateId = `A${candidateNumber}`;
      }

      activityIds.push(candidateId);
    }

    return activityIds;
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

  async importExcelFile(fileBuffer: Buffer, projectId: string, userId: string) {
    // Check project access
    const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }

    try {
      // Wipe existing schedule (except root) so re-imports don't violate unique constraints
      await this.clearExistingSchedule(projectId);

      const parsedData = await this.parseExcelContent(fileBuffer);
      
      // First create/update resource types and resources
      await this.importResourceTypes(parsedData.resourceTypes);
      const resourceMap = await this.importResources(parsedData.resources);
      
      // Import project data
      await this.importExcelProjectData(parsedData.project, projectId);
      
      // Import tasks with enhanced mapping
      const taskMap = await this.importExcelTasks(parsedData.tasks, projectId);
      
      // Import resource assignments
      await this.importResourceAssignments(parsedData.assignments, taskMap, resourceMap);
      
      // Import dependencies from predecessor/successor data
      await this.importExcelDependencies(parsedData.tasks, taskMap);

      // Recalculate budget roll-ups so level 0 shows correct total
      await this.tasksService.recalculateProjectBudgets(projectId, userId);

      return {
        message: 'Excel schedule template imported successfully',
        project: parsedData.project.name,
        tasksImported: parsedData.tasks.length,
        resourcesImported: parsedData.resources.size,
        assignmentsImported: parsedData.assignments.length,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to import Excel file: ${error.message}`);
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

    // Generate unique activity IDs for all tasks upfront
    const activityIds = await this.generateBatchActivityIds(p6Tasks.length);

    // First pass: create all tasks
    for (let i = 0; i < p6Tasks.length; i++) {
      const p6Task = p6Tasks[i];
      const activityId = activityIds[i];
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

    // --- SECOND PASS: ensure parentId set for any orphan tasks based on WBS code ---
    const dbTasks = await this.prisma.task.findMany({
      where: { projectId },
      select: { id: true, wbsCode: true, parentId: true, level: true },
    });

    const wbsToId = new Map<string, string>();
    dbTasks.forEach(t => wbsToId.set(t.wbsCode, t.id));

    // Identify root task once
    const rootId = dbTasks.find(t => t.level === 0)?.id || null;

    for (const t of dbTasks) {
      if (t.level === 0 || t.parentId) continue;

      const parts = t.wbsCode.split('.');
      parts.pop();
      const parentWbs = parts.join('.');

      let parentId = wbsToId.get(parentWbs);
      if (!parentId && rootId) {
        parentId = rootId;
      }

      if (parentId) {
        await this.prisma.task.update({ where: { id: t.id }, data: { parentId } });
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
      case 'SS': return 'SS';
      case 'FF': return 'FF';
      case 'SF': return 'SF';
      default: return 'FS';
    }
  }

  private async parseExcelContent(fileBuffer: Buffer): Promise<ParsedExcelData> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length < 2) {
      throw new BadRequestException('Excel file must contain header row and data rows');
    }

    // Extract headers and map column indices
    const headers = jsonData[0] as string[];
    const columnMap = this.createColumnMap(headers);
    
    // Extract project info (could be from filename or first row metadata)
    const projectName = this.extractProjectName(workbook, sheetName);
    
    const tasks: ExcelTaskRow[] = [];
    const resourceTypes = new Set<string>();
    const resources = new Map<string, { name: string; type: string; rate: number }>();
    const assignments: Array<{ taskId: string; resourceName: string; hours: number }> = [];
    
    // Process data rows (skip header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as any[];
      if (!row || row.length === 0) continue;
      
      const taskRow = this.parseTaskRow(row, columnMap);
      if (!taskRow.description || taskRow.description.trim() === '') continue;
      
      tasks.push(taskRow);
      
      // Extract resource assignments from the row
      this.extractResourceAssignments(taskRow, resourceTypes, resources, assignments);
    }
    
    // Calculate project dates from tasks
    const { startDate, endDate, budget } = this.calculateProjectMetrics(tasks);
    
    return {
      project: {
        name: projectName,
        startDate,
        endDate,
        budget,
      },
      tasks,
      resourceTypes,
      resources,
      assignments,
    };
  }

  private createColumnMap(headers: string[]): Map<string, number> {
    const map = new Map<string, number>();
    
    headers.forEach((header, index) => {
      const cleanHeader = header?.toString().toLowerCase().trim();
      
      // Map common column names to our fields
      if (cleanHeader.includes('level')) map.set('level', index);
      if (cleanHeader.includes('id') && !cleanHeader.includes('wbs')) map.set('id', index);
      if (cleanHeader.includes('description') || cleanHeader.includes('task name') || cleanHeader.includes('activity')) {
        map.set('description', index);
      }
      if (cleanHeader.includes('type')) map.set('type', index);
      if (cleanHeader.includes('planned duration') || cleanHeader.includes('duration')) map.set('plannedDuration', index);
      if (cleanHeader.includes('start date') && !cleanHeader.includes('baseline')) map.set('startDate', index);
      if (cleanHeader.includes('finish date') && !cleanHeader.includes('baseline')) map.set('finishDate', index);
      if (cleanHeader.includes('predecessor')) map.set('predecessor', index);
      if (cleanHeader.includes('successor')) map.set('successor', index);
      if (cleanHeader.includes('baseline start')) map.set('baselineStartDate', index);
      if (cleanHeader.includes('baseline finish')) map.set('baselineFinishDate', index);
      if (cleanHeader.includes('accountable') || cleanHeader.includes('responsible designation')) {
        map.set('accountableDesignation', index);
      }
      if (cleanHeader.includes('responsible personnel')) map.set('responsiblePersonnel', index);
      if (cleanHeader.includes('project manager')) map.set('projectManager', index);
      if (cleanHeader.includes('junior design')) map.set('juniorDesign', index);
      if (cleanHeader.includes('intermediate design')) map.set('intermediateDesign', index);
      if (cleanHeader.includes('senior design')) map.set('seniorDesign', index);
      if (cleanHeader.includes('budget') && !cleanHeader.includes('baseline')) map.set('budget', index);
      if (cleanHeader.includes('flag')) map.set('flag', index);
    });
    
    return map;
  }

  private parseTaskRow(row: any[], columnMap: Map<string, number>): ExcelTaskRow {
    const getCell = (field: string): any => {
      const index = columnMap.get(field);
      return index !== undefined ? row[index] : undefined;
    };
    
    const parseNumber = (value: any): number | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      const num = parseFloat(value.toString());
      return isNaN(num) ? undefined : num;
    };
    
    const parseDate = (value: any): string | undefined => {
      if (!value) return undefined;
      
      // Handle Excel date serial numbers
      if (typeof value === 'number' && value > 25000) { // Excel date serial
        const date = new Date((value - 25569) * 86400 * 1000);
        return date.toISOString().split('T')[0];
      }
      
      // Handle string dates
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      
      return undefined;
    };
    
    return {
      level: parseNumber(getCell('level')),
      id: getCell('id')?.toString(),
      description: getCell('description')?.toString(),
      type: getCell('type')?.toString(),
      plannedDuration: getCell('plannedDuration')?.toString(),
      startDate: parseDate(getCell('startDate')),
      finishDate: parseDate(getCell('finishDate')),
      predecessor: getCell('predecessor')?.toString(),
      successor: getCell('successor')?.toString(),
      baselineStartDate: parseDate(getCell('baselineStartDate')),
      baselineFinishDate: parseDate(getCell('baselineFinishDate')),
      accountableDesignation: getCell('accountableDesignation')?.toString(),
      responsiblePersonnel: getCell('responsiblePersonnel')?.toString(),
      projectManager: getCell('projectManager')?.toString(),
      flag: getCell('flag')?.toString(),
      juniorDesign: parseNumber(getCell('juniorDesign')),
      intermediateDesign: parseNumber(getCell('intermediateDesign')),
      seniorDesign: parseNumber(getCell('seniorDesign')),
      budget: parseNumber(getCell('budget')),
    };
  }

  private extractProjectName(workbook: XLSX.WorkBook, sheetName: string): string {
    // Try to extract project name from sheet name or workbook properties
    if (workbook.Props?.Title) {
      return workbook.Props.Title;
    }
    
    // Use sheet name if it's not generic
    if (sheetName !== 'Sheet1' && sheetName !== 'Worksheet') {
      return sheetName;
    }
    
    // Default fallback
    return `Imported Project ${new Date().toISOString().split('T')[0]}`;
  }

  private extractResourceAssignments(
    taskRow: ExcelTaskRow,
    resourceTypes: Set<string>,
    resources: Map<string, { name: string; type: string; rate: number }>,
    assignments: Array<{ taskId: string; resourceName: string; hours: number }>
  ): void {
    if (!taskRow.id) return;
    
    // Resource type setup
    resourceTypes.add('Design');
    resourceTypes.add('Management');
    
    // Extract design resource assignments
    if (taskRow.juniorDesign && taskRow.juniorDesign > 0) {
      const resourceName = 'Junior Designer';
      resources.set(resourceName, { name: resourceName, type: 'Design', rate: 75 });
      assignments.push({ taskId: taskRow.id, resourceName, hours: taskRow.juniorDesign });
    }
    
    if (taskRow.intermediateDesign && taskRow.intermediateDesign > 0) {
      const resourceName = 'Intermediate Designer';
      resources.set(resourceName, { name: resourceName, type: 'Design', rate: 95 });
      assignments.push({ taskId: taskRow.id, resourceName, hours: taskRow.intermediateDesign });
    }
    
    if (taskRow.seniorDesign && taskRow.seniorDesign > 0) {
      const resourceName = 'Senior Designer';
      resources.set(resourceName, { name: resourceName, type: 'Design', rate: 125 });
      assignments.push({ taskId: taskRow.id, resourceName, hours: taskRow.seniorDesign });
    }
    
    // Extract management assignments
    if (taskRow.projectManager && taskRow.projectManager.trim() !== '') {
      const resourceName = taskRow.projectManager;
      resources.set(resourceName, { name: resourceName, type: 'Management', rate: 150 });
      // Assign default 2 hours for project management if no specific hours given
      assignments.push({ taskId: taskRow.id, resourceName, hours: 2 });
    }
  }

  private calculateProjectMetrics(tasks: ExcelTaskRow[]): { startDate?: string; endDate?: string; budget?: number } {
    let earliestStart: Date | null = null;
    let latestFinish: Date | null = null;
    let totalBudget = 0;
    
    tasks.forEach(task => {
      if (task.startDate) {
        const start = new Date(task.startDate);
        if (!earliestStart || start < earliestStart) {
          earliestStart = start;
        }
      }
      
      if (task.finishDate) {
        const finish = new Date(task.finishDate);
        if (!latestFinish || finish > latestFinish) {
          latestFinish = finish;
        }
      }
      
      if (task.budget) {
        totalBudget += task.budget;
      }
    });
    
    return {
      startDate: earliestStart?.toISOString().split('T')[0],
      endDate: latestFinish?.toISOString().split('T')[0],
      budget: totalBudget > 0 ? totalBudget : undefined,
    };
  }

  // Excel-specific import methods
  private async importResourceTypes(resourceTypes: Set<string>): Promise<void> {
    for (const typeName of resourceTypes) {
      await this.prisma.resourceType.upsert({
        where: { name: typeName },
        update: {},
        create: { name: typeName },
      });
    }
  }

  private async importResources(resources: Map<string, { name: string; type: string; rate: number }>): Promise<Map<string, string>> {
    const resourceMap = new Map<string, string>();
    
    for (const [name, resource] of resources) {
      // Find resource type
      const resourceType = await this.prisma.resourceType.findUnique({
        where: { name: resource.type },
      });
      
      if (resourceType) {
        // Find existing resource by name and type
        const existingResource = await this.prisma.resource.findFirst({
          where: {
            name: resource.name,
            typeId: resourceType.id,
          },
        });
        
        let createdResource;
        if (existingResource) {
          // Update existing resource
          createdResource = await this.prisma.resource.update({
            where: { id: existingResource.id },
            data: { rateFloat: resource.rate },
          });
        } else {
          // Create new resource
          createdResource = await this.prisma.resource.create({
            data: {
              name: resource.name,
              rateFloat: resource.rate,
              typeId: resourceType.id,
            },
          });
        }
        
        resourceMap.set(name, createdResource.id);
      }
    }
    
    return resourceMap;
  }

  private async importExcelProjectData(projectData: ParsedExcelData['project'], projectId: string): Promise<void> {
    // First, get the current project to check its name
    const currentProject = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true }
    });

    const updateData: any = {};
    
    // Only update the name if the current name is generic (created from import flow)
    if (currentProject && currentProject.name === 'New Project from Schedule Import') {
      updateData.name = projectData.name;
    }
    // Otherwise, keep the user-provided name
    
    if (projectData.startDate) {
      updateData.startDate = new Date(projectData.startDate);
    }
    
    if (projectData.endDate) {
      updateData.endDate = new Date(projectData.endDate);
    }
    
    if (projectData.budget) {
      updateData.budget = projectData.budget;
    }
    
    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });
    }
  }

  private async importExcelTasks(tasks: ExcelTaskRow[], projectId: string): Promise<Map<string, string>> {
    const taskMap = new Map<string, string>();
    const wbsMap = new Map<string, number>(); // Track WBS numbering
    
    // Preserve the original row order from the spreadsheet so parent/child relationships match exactly

    // Generate unique activity IDs for all tasks upfront
    const activityIds = await this.generateBatchActivityIds(tasks.length);
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const activityId = activityIds[i];
      
      // Generate WBS code based on level and hierarchy
      const wbsCode = this.generateWbsCode(task, wbsMap);
      
      // Determine parent based on level hierarchy
      const parentId = this.findParentTask(task, tasks, taskMap);
      
      // Calculate dates
      const startDate = task.startDate ? new Date(task.startDate) : new Date();
      const endDate = task.finishDate ? new Date(task.finishDate) : new Date();
      
      // Determine if milestone based on type or duration
      const isMilestone = task.type?.toLowerCase().includes('milestone') || 
                         task.plannedDuration === '0' ||
                         task.plannedDuration === '0d';
      
      // Calculate budget from individual budget field or resource hours
      const budget = task.budget || this.calculateTaskBudget(task);
      
      const createdTask = await this.prisma.task.create({
        data: {
          projectId,
          parentId,
          level: task.level || 0,
          wbsCode,
          title: task.description || 'Unnamed Task',
          description: task.flag || '',
          startDate,
          endDate,
          isMilestone,
          costLabor: budget,
          costMaterial: 0,
          costOther: 0,
          totalCost: budget,
          activityId,
          resourceRole: task.accountableDesignation,
          resourceQty: this.calculateTotalHours(task),
        },
      });
      
      if (task.id) {
        taskMap.set(task.id, createdTask.id);
      }
      // Also map by WBS code so we can easily look up later
      taskMap.set(wbsCode, createdTask.id);
    }
    
    // SECOND PASS – ensure every non-root task has parentId based on WBS hierarchy
    const dbTasks = await this.prisma.task.findMany({
      where: { projectId },
      select: { id: true, wbsCode: true, parentId: true, level: true },
    });

    const wbsToId = new Map<string, string>();
    dbTasks.forEach(t => wbsToId.set(t.wbsCode, t.id));

    const rootId = dbTasks.find(t => t.level === 0)?.id || null;

    for (const t of dbTasks) {
      if (t.level === 0) continue;
      if (t.parentId) continue;

      const segments = t.wbsCode.split('.');
      if (segments.length === 0) continue;
      segments.pop();
      const parentWbs = segments.join('.');
      let parentId = wbsToId.get(parentWbs);

      // If no explicit parent found (i.e., Level 1 task), fall back to root
      if (!parentId && rootId) {
        parentId = rootId;
      }

      if (parentId) {
        await this.prisma.task.update({
          where: { id: t.id },
          data: { parentId },
        });
      }
    }

    return taskMap;
  }

  private generateWbsCode(task: ExcelTaskRow, wbsMap: Map<string, number>): string {
    const level = task.level || 0;

    // Use an array for more predictable counting
    let counters = (wbsMap.get('counters_arr') as unknown as number[]) || [];
    
    // Ensure the counters array has slots up to current level
    while (counters.length <= level) counters.push(0);

    // Increment counter at current level
    counters[level] += 1;

    // Reset deeper level counters
    for (let i = level + 1; i < counters.length; i++) {
      counters[i] = 0;
    }

    // Update the map with the modified counters array
    wbsMap.set('counters_arr', counters as any);

    // Build WBS code
    const segments = counters.slice(0, level + 1).map(n => n.toString());
    return segments.join('.');
  }

  private findParentTask(task: ExcelTaskRow, allTasks: ExcelTaskRow[], taskMap: Map<string, string>): string | null {
    if (!task.level || task.level === 0) return null;
    
    // Find the nearest task with a lower level
    const taskIndex = allTasks.indexOf(task);
    for (let i = taskIndex - 1; i >= 0; i--) {
      const potentialParent = allTasks[i];
      if ((potentialParent.level || 0) < task.level && potentialParent.id) {
        return taskMap.get(potentialParent.id) || null;
      }
    }
    
    return null;
  }

  private calculateTaskBudget(task: ExcelTaskRow): number {
    let budget = 0;
    
    if (task.juniorDesign) budget += task.juniorDesign * 75;
    if (task.intermediateDesign) budget += task.intermediateDesign * 95;
    if (task.seniorDesign) budget += task.seniorDesign * 125;
    
    return budget;
  }

  private calculateTotalHours(task: ExcelTaskRow): number {
    let hours = 0;
    
    if (task.juniorDesign) hours += task.juniorDesign;
    if (task.intermediateDesign) hours += task.intermediateDesign;
    if (task.seniorDesign) hours += task.seniorDesign;
    
    return hours || null;
  }

  private async importResourceAssignments(
    assignments: Array<{ taskId: string; resourceName: string; hours: number }>,
    taskMap: Map<string, string>,
    resourceMap: Map<string, string>
  ): Promise<void> {
    for (const assignment of assignments) {
      const dbTaskId = taskMap.get(assignment.taskId);
      const dbResourceId = resourceMap.get(assignment.resourceName);
      
      if (dbTaskId && dbResourceId) {
        await this.prisma.resourceAssignment.upsert({
          where: {
            taskId_resourceId: {
              taskId: dbTaskId,
              resourceId: dbResourceId,
            },
          },
          update: {
            hours: assignment.hours,
          },
          create: {
            taskId: dbTaskId,
            resourceId: dbResourceId,
            hours: assignment.hours,
          },
        });
      }
    }
  }

  private async importExcelDependencies(tasks: ExcelTaskRow[], taskMap: Map<string, string>): Promise<void> {
    for (const task of tasks) {
      if (!task.id || !task.predecessor) continue;
      
      const successorId = taskMap.get(task.id);
      if (!successorId) continue;
      
      // Parse predecessor field (could be comma-separated)
      const predecessors = task.predecessor.split(',').map(p => p.trim());
      
      for (const pred of predecessors) {
        if (!pred) continue;
        
        // Parse dependency format (e.g., "5FS", "3SS+2", etc.)
        const match = pred.match(/^(\w+)([A-Z]{2})([+-]\d+)?$/);
        if (!match) {
          // Simple ID format
          const predecessorId = taskMap.get(pred);
          if (predecessorId) {
            await this.createDependency(predecessorId, successorId, 'FS', 0);
          }
        } else {
          const [, predId, type, lagStr] = match;
          const predecessorId = taskMap.get(predId);
          const lag = lagStr ? parseInt(lagStr) : 0;
          const depType = this.mapDependencyType(type);
          
          if (predecessorId) {
            await this.createDependency(predecessorId, successorId, depType, lag);
          }
        }
      }
    }
  }

  private mapDependencyType(type: string): 'FS' | 'SS' | 'FF' | 'SF' {
    switch (type.toUpperCase()) {
      case 'SS': return 'SS';
      case 'FF': return 'FF';
      case 'SF': return 'SF';
      default: return 'FS';
    }
  }

  private async createDependency(predecessorId: string, successorId: string, type: 'FS' | 'SS' | 'FF' | 'SF', lag: number): Promise<void> {
    try {
      await this.prisma.taskDependency.create({
        data: {
          predecessorId,
          successorId,
          type: type as any,
          lag,
        },
      });
    } catch (error) {
      // Ignore duplicate dependencies
      if (!error.message?.includes('unique constraint')) {
        throw error;
      }
    }
  }

  // Delete all tasks > level 0 and related records so a project can be re-imported safely
  private async clearExistingSchedule(projectId: string): Promise<void> {
    await this.prisma.$transaction([
      // delete dependencies first (FKs)
      this.prisma.taskDependency.deleteMany({ where: { OR: [ { predecessor: { projectId } }, { successor: { projectId } } ] } }),
      this.prisma.taskRelation.deleteMany({ where: { OR: [ { predecessor: { projectId } }, { successor: { projectId } } ] } }),
      this.prisma.resourceAssignment.deleteMany({ where: { task: { projectId } } }),
      // delete tasks except root level 0
      this.prisma.task.deleteMany({ where: { projectId, level: { gt: 0 } } })
    ]);
  }
} 