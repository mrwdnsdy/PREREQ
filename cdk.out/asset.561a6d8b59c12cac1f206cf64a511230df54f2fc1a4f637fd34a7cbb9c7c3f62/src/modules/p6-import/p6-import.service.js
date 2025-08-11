"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.P6ImportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const tasks_service_1 = require("../tasks/tasks.service");
const xml2js = require("xml2js");
const XLSX = require("xlsx");
let P6ImportService = class P6ImportService {
    constructor(prisma, authService, tasksService) {
        this.prisma = prisma;
        this.authService = authService;
        this.tasksService = tasksService;
    }
    async generateUniqueActivityId() {
        const lastTask = await this.prisma.task.findFirst({
            select: { activityId: true },
            orderBy: { activityId: 'desc' },
        });
        let nextNumber = 1010;
        if (lastTask?.activityId) {
            const match = lastTask.activityId.match(/^A(\d+)$/);
            if (match) {
                nextNumber = parseInt(match[1]) + 10;
            }
        }
        return `A${nextNumber}`;
    }
    async generateBatchActivityIds(count) {
        const lastTask = await this.prisma.task.findFirst({
            select: { activityId: true },
            where: {
                activityId: {
                    startsWith: "A"
                }
            },
            orderBy: {
                activityId: 'desc'
            },
        });
        let nextNumber = 1010;
        if (lastTask?.activityId) {
            const match = lastTask.activityId.match(/^A(\d+)$/);
            if (match) {
                nextNumber = parseInt(match[1]) + 10;
            }
        }
        const activityIds = [];
        for (let i = 0; i < count; i++) {
            let candidateNumber = nextNumber + i * 10;
            let candidateId = `A${candidateNumber}`;
            while (await this.prisma.task.findFirst({ where: { activityId: candidateId }, select: { id: true } })) {
                candidateNumber += 10;
                candidateId = `A${candidateNumber}`;
            }
            activityIds.push(candidateId);
        }
        return activityIds;
    }
    async importXERFile(fileBuffer, projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        try {
            const fileContent = fileBuffer.toString('utf-8');
            const parsedData = await this.parseXERContent(fileContent);
            const project = await this.importProjectData(parsedData.project, projectId);
            const taskMap = await this.importTasks(parsedData.tasks, projectId);
            await this.importRelations(parsedData.relations, taskMap);
            return {
                message: 'P6 file imported successfully',
                project: project.name,
                tasksImported: Object.keys(taskMap).length,
                relationsImported: parsedData.relations.length,
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(`Failed to import P6 file: ${error.message}`);
        }
    }
    async importXMLFile(fileBuffer, projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        try {
            const fileContent = fileBuffer.toString('utf-8');
            const parsedData = await this.parseXMLContent(fileContent);
            const project = await this.importProjectData(parsedData.project, projectId);
            const taskMap = await this.importTasks(parsedData.tasks, projectId);
            await this.importRelations(parsedData.relations, taskMap);
            return {
                message: 'P6 XML file imported successfully',
                project: project.name,
                tasksImported: Object.keys(taskMap).length,
                relationsImported: parsedData.relations.length,
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(`Failed to import P6 XML file: ${error.message}`);
        }
    }
    async importExcelFile(fileBuffer, projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        try {
            await this.clearExistingSchedule(projectId);
            const parsedData = await this.parseExcelContent(fileBuffer);
            await this.importResourceTypes(parsedData.resourceTypes);
            const resourceMap = await this.importResources(parsedData.resources);
            await this.importExcelProjectData(parsedData.project, projectId);
            const taskMap = await this.importExcelTasks(parsedData.tasks, projectId);
            await this.importResourceAssignments(parsedData.assignments, taskMap, resourceMap);
            await this.importExcelDependencies(parsedData.tasks, taskMap);
            await this.tasksService.recalculateProjectBudgets(projectId, userId);
            return {
                message: 'Excel schedule template imported successfully',
                project: parsedData.project.name,
                tasksImported: parsedData.tasks.length,
                resourcesImported: parsedData.resources.size,
                assignmentsImported: parsedData.assignments.length,
            };
        }
        catch (error) {
            throw new common_1.BadRequestException(`Failed to import Excel file: ${error.message}`);
        }
    }
    async parseXERContent(content) {
        const lines = content.split('\n');
        const project = {
            proj_id: '',
            proj_name: '',
            start_date: '',
            end_date: '',
            budget: 0,
        };
        const tasks = [];
        const relations = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts[0] === 'PROJECT') {
                project.proj_id = parts[1] || '';
                project.proj_name = parts[2] || '';
                project.start_date = parts[3] || '';
                project.end_date = parts[4] || '';
                project.budget = parseFloat(parts[5] || '0');
            }
            else if (parts[0] === 'TASK') {
                tasks.push({
                    task_id: parts[1] || '',
                    wbs_id: parts[2] || '',
                    task_name: parts[3] || '',
                    start_date: parts[4] || '',
                    end_date: parts[5] || '',
                    is_milestone: parts[6] === 'Y',
                    parent_id: parts[7] || undefined,
                });
            }
            else if (parts[0] === 'TASKPRED') {
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
    async parseXMLContent(content) {
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(content);
        const projectData = result.project || {};
        const project = {
            proj_id: projectData.id?.[0] || '',
            proj_name: projectData.name?.[0] || '',
            start_date: projectData.start_date?.[0] || '',
            end_date: projectData.end_date?.[0] || '',
            budget: parseFloat(projectData.budget?.[0] || '0'),
        };
        const tasks = [];
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
        const relations = [];
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
    async importProjectData(p6Project, projectId) {
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
    async importTasks(p6Tasks, projectId) {
        const taskMap = new Map();
        const activityIds = await this.generateBatchActivityIds(p6Tasks.length);
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
                    level: 1,
                },
            });
            taskMap.set(p6Task.task_id, task.id);
        }
        const dbTasks = await this.prisma.task.findMany({
            where: { projectId },
            select: { id: true, wbsCode: true, parentId: true, level: true },
        });
        const wbsToId = new Map();
        dbTasks.forEach(t => wbsToId.set(t.wbsCode, t.id));
        const rootId = dbTasks.find(t => t.level === 0)?.id || null;
        for (const t of dbTasks) {
            if (t.level === 0 || t.parentId)
                continue;
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
    async importRelations(p6Relations, taskMap) {
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
                            lag: p6Relation.lag_hr_cnt * 60,
                        },
                    });
                }
                catch (error) {
                    console.log(`Skipping duplicate relation: ${p6Relation.pred_task_id} -> ${p6Relation.succ_task_id}`);
                }
            }
        }
    }
    mapRelationType(p6Type) {
        switch (p6Type.toUpperCase()) {
            case 'SS': return 'SS';
            case 'FF': return 'FF';
            case 'SF': return 'SF';
            default: return 'FS';
        }
    }
    async parseExcelContent(fileBuffer) {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (jsonData.length < 2) {
            throw new common_1.BadRequestException('Excel file must contain header row and data rows');
        }
        const headers = jsonData[0];
        const columnMap = this.createColumnMap(headers);
        const projectName = this.extractProjectName(workbook, sheetName);
        const tasks = [];
        const resourceTypes = new Set();
        const resources = new Map();
        const assignments = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0)
                continue;
            const taskRow = this.parseTaskRow(row, columnMap);
            if (!taskRow.description || taskRow.description.trim() === '')
                continue;
            tasks.push(taskRow);
            this.extractResourceAssignments(taskRow, resourceTypes, resources, assignments);
        }
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
    createColumnMap(headers) {
        const map = new Map();
        headers.forEach((header, index) => {
            const cleanHeader = header?.toString().toLowerCase().trim();
            if (cleanHeader.includes('level'))
                map.set('level', index);
            if (cleanHeader.includes('id') && !cleanHeader.includes('wbs'))
                map.set('id', index);
            if (cleanHeader.includes('description') || cleanHeader.includes('task name') || cleanHeader.includes('activity')) {
                map.set('description', index);
            }
            if (cleanHeader.includes('type'))
                map.set('type', index);
            if (cleanHeader.includes('planned duration') || cleanHeader.includes('duration'))
                map.set('plannedDuration', index);
            if (cleanHeader.includes('start date') && !cleanHeader.includes('baseline'))
                map.set('startDate', index);
            if (cleanHeader.includes('finish date') && !cleanHeader.includes('baseline'))
                map.set('finishDate', index);
            if (cleanHeader.includes('predecessor'))
                map.set('predecessor', index);
            if (cleanHeader.includes('successor'))
                map.set('successor', index);
            if (cleanHeader.includes('baseline start'))
                map.set('baselineStartDate', index);
            if (cleanHeader.includes('baseline finish'))
                map.set('baselineFinishDate', index);
            if (cleanHeader.includes('accountable') || cleanHeader.includes('responsible designation')) {
                map.set('accountableDesignation', index);
            }
            if (cleanHeader.includes('responsible personnel'))
                map.set('responsiblePersonnel', index);
            if (cleanHeader.includes('project manager'))
                map.set('projectManager', index);
            if (cleanHeader.includes('junior design'))
                map.set('juniorDesign', index);
            if (cleanHeader.includes('intermediate design'))
                map.set('intermediateDesign', index);
            if (cleanHeader.includes('senior design'))
                map.set('seniorDesign', index);
            if (cleanHeader.includes('budget') && !cleanHeader.includes('baseline'))
                map.set('budget', index);
            if (cleanHeader.includes('flag'))
                map.set('flag', index);
        });
        return map;
    }
    parseTaskRow(row, columnMap) {
        const getCell = (field) => {
            const index = columnMap.get(field);
            return index !== undefined ? row[index] : undefined;
        };
        const parseNumber = (value) => {
            if (value === null || value === undefined || value === '')
                return undefined;
            const num = parseFloat(value.toString());
            return isNaN(num) ? undefined : num;
        };
        const parseDate = (value) => {
            if (!value)
                return undefined;
            if (typeof value === 'number' && value > 25000) {
                const date = new Date((value - 25569) * 86400 * 1000);
                return date.toISOString().split('T')[0];
            }
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
    extractProjectName(workbook, sheetName) {
        if (workbook.Props?.Title) {
            return workbook.Props.Title;
        }
        if (sheetName !== 'Sheet1' && sheetName !== 'Worksheet') {
            return sheetName;
        }
        return `Imported Project ${new Date().toISOString().split('T')[0]}`;
    }
    extractResourceAssignments(taskRow, resourceTypes, resources, assignments) {
        if (!taskRow.id)
            return;
        resourceTypes.add('Design');
        resourceTypes.add('Management');
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
        if (taskRow.projectManager && taskRow.projectManager.trim() !== '') {
            const resourceName = taskRow.projectManager;
            resources.set(resourceName, { name: resourceName, type: 'Management', rate: 150 });
            assignments.push({ taskId: taskRow.id, resourceName, hours: 2 });
        }
    }
    calculateProjectMetrics(tasks) {
        let earliestStart = null;
        let latestFinish = null;
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
    async importResourceTypes(resourceTypes) {
        for (const typeName of resourceTypes) {
            await this.prisma.resourceType.upsert({
                where: { name: typeName },
                update: {},
                create: { name: typeName },
            });
        }
    }
    async importResources(resources) {
        const resourceMap = new Map();
        for (const [name, resource] of resources) {
            const resourceType = await this.prisma.resourceType.findUnique({
                where: { name: resource.type },
            });
            if (resourceType) {
                const existingResource = await this.prisma.resource.findFirst({
                    where: {
                        name: resource.name,
                        typeId: resourceType.id,
                    },
                });
                let createdResource;
                if (existingResource) {
                    createdResource = await this.prisma.resource.update({
                        where: { id: existingResource.id },
                        data: { rateFloat: resource.rate },
                    });
                }
                else {
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
    async importExcelProjectData(projectData, projectId) {
        const currentProject = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { name: true }
        });
        const updateData = {};
        if (currentProject && currentProject.name === 'New Project from Schedule Import') {
            updateData.name = projectData.name;
        }
        if (projectData.startDate) {
            updateData.startDate = new Date(projectData.startDate);
        }
        if (projectData.endDate) {
            updateData.endDate = new Date(projectData.endDate);
        }
        if (projectData.budget) {
            updateData.budget = projectData.budget;
        }
        if (Object.keys(updateData).length > 0) {
            await this.prisma.project.update({
                where: { id: projectId },
                data: updateData,
            });
        }
    }
    async importExcelTasks(tasks, projectId) {
        const taskMap = new Map();
        const wbsMap = new Map();
        const activityIds = await this.generateBatchActivityIds(tasks.length);
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const activityId = activityIds[i];
            const wbsCode = this.generateWbsCode(task, wbsMap);
            const parentId = this.findParentTask(task, tasks, taskMap);
            const startDate = task.startDate ? new Date(task.startDate) : new Date();
            const endDate = task.finishDate ? new Date(task.finishDate) : new Date();
            const isMilestone = task.type?.toLowerCase().includes('milestone') ||
                task.plannedDuration === '0' ||
                task.plannedDuration === '0d';
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
            taskMap.set(wbsCode, createdTask.id);
        }
        const dbTasks = await this.prisma.task.findMany({
            where: { projectId },
            select: { id: true, wbsCode: true, parentId: true, level: true },
        });
        const wbsToId = new Map();
        dbTasks.forEach(t => wbsToId.set(t.wbsCode, t.id));
        const rootId = dbTasks.find(t => t.level === 0)?.id || null;
        for (const t of dbTasks) {
            if (t.level === 0)
                continue;
            if (t.parentId)
                continue;
            const segments = t.wbsCode.split('.');
            if (segments.length === 0)
                continue;
            segments.pop();
            const parentWbs = segments.join('.');
            let parentId = wbsToId.get(parentWbs);
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
    generateWbsCode(task, wbsMap) {
        const level = task.level || 0;
        let counters = wbsMap.get('counters_arr') || [];
        while (counters.length <= level)
            counters.push(0);
        counters[level] += 1;
        for (let i = level + 1; i < counters.length; i++) {
            counters[i] = 0;
        }
        wbsMap.set('counters_arr', counters);
        const segments = counters.slice(0, level + 1).map(n => n.toString());
        return segments.join('.');
    }
    findParentTask(task, allTasks, taskMap) {
        if (!task.level || task.level === 0)
            return null;
        const taskIndex = allTasks.indexOf(task);
        for (let i = taskIndex - 1; i >= 0; i--) {
            const potentialParent = allTasks[i];
            if ((potentialParent.level || 0) < task.level && potentialParent.id) {
                return taskMap.get(potentialParent.id) || null;
            }
        }
        return null;
    }
    calculateTaskBudget(task) {
        let budget = 0;
        if (task.juniorDesign)
            budget += task.juniorDesign * 75;
        if (task.intermediateDesign)
            budget += task.intermediateDesign * 95;
        if (task.seniorDesign)
            budget += task.seniorDesign * 125;
        return budget;
    }
    calculateTotalHours(task) {
        let hours = 0;
        if (task.juniorDesign)
            hours += task.juniorDesign;
        if (task.intermediateDesign)
            hours += task.intermediateDesign;
        if (task.seniorDesign)
            hours += task.seniorDesign;
        return hours || null;
    }
    async importResourceAssignments(assignments, taskMap, resourceMap) {
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
    async importExcelDependencies(tasks, taskMap) {
        for (const task of tasks) {
            if (!task.id || !task.predecessor)
                continue;
            const successorId = taskMap.get(task.id);
            if (!successorId)
                continue;
            const predecessors = task.predecessor.split(',').map(p => p.trim());
            for (const pred of predecessors) {
                if (!pred)
                    continue;
                const match = pred.match(/^(\w+)([A-Z]{2})([+-]\d+)?$/);
                if (!match) {
                    const predecessorId = taskMap.get(pred);
                    if (predecessorId) {
                        await this.createDependency(predecessorId, successorId, 'FS', 0);
                    }
                }
                else {
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
    mapDependencyType(type) {
        switch (type.toUpperCase()) {
            case 'SS': return 'SS';
            case 'FF': return 'FF';
            case 'SF': return 'SF';
            default: return 'FS';
        }
    }
    async createDependency(predecessorId, successorId, type, lag) {
        try {
            await this.prisma.taskDependency.create({
                data: {
                    predecessorId,
                    successorId,
                    type: type,
                    lag,
                },
            });
        }
        catch (error) {
            if (!error.message?.includes('unique constraint')) {
                throw error;
            }
        }
    }
    async clearExistingSchedule(projectId) {
        await this.prisma.$transaction([
            this.prisma.taskDependency.deleteMany({ where: { OR: [{ predecessor: { projectId } }, { successor: { projectId } }] } }),
            this.prisma.taskRelation.deleteMany({ where: { OR: [{ predecessor: { projectId } }, { successor: { projectId } }] } }),
            this.prisma.resourceAssignment.deleteMany({ where: { task: { projectId } } }),
            this.prisma.task.deleteMany({ where: { projectId, level: { gt: 0 } } })
        ]);
    }
};
exports.P6ImportService = P6ImportService;
exports.P6ImportService = P6ImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        tasks_service_1.TasksService])
], P6ImportService);
//# sourceMappingURL=p6-import.service.js.map