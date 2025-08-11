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
exports.ScheduleImportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const library_1 = require("@prisma/client/runtime/library");
let ScheduleImportService = class ScheduleImportService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async importSchedule(importDto, userId) {
        console.log('Starting schedule import for project:', importDto.projectId);
        const project = await this.prisma.project.findUnique({
            where: { id: importDto.projectId },
            include: {
                members: {
                    where: { userId: userId }
                }
            }
        });
        if (!project) {
            throw new common_1.BadRequestException('Project not found');
        }
        if (project.members.length === 0) {
            throw new common_1.BadRequestException('Insufficient permissions for this project');
        }
        if (importDto.options?.replaceExisting) {
            await this.clearExistingTasks(importDto.projectId);
        }
        const wbsTree = this.buildWbsHierarchy(importDto.tasks);
        if (importDto.options?.generateWbsCodes) {
            this.generateWbsCodes(wbsTree);
        }
        const createdTasks = await this.createTasksFromTree(wbsTree, importDto.projectId);
        if (importDto.options?.validateDependencies !== false) {
            await this.createTaskRelationships(importDto.tasks, createdTasks);
        }
        await this.updateBudgetRollups(importDto.projectId);
        return {
            success: true,
            importedTasks: createdTasks.length,
            message: `Successfully imported ${createdTasks.length} tasks`
        };
    }
    buildWbsHierarchy(tasks) {
        console.log('Building WBS hierarchy from', tasks.length, 'tasks');
        const sortedTasks = tasks.sort((a, b) => {
            if (a.level !== b.level)
                return a.level - b.level;
            return a.activityId.localeCompare(b.activityId);
        });
        const nodeMap = new Map();
        const rootNodes = [];
        for (const task of sortedTasks) {
            const node = {
                level: task.level,
                activityId: task.activityId,
                title: task.description,
                children: [],
                wbsCode: '',
                originalRow: task
            };
            nodeMap.set(task.activityId, node);
        }
        for (const task of sortedTasks) {
            const currentNode = nodeMap.get(task.activityId);
            if (task.level === 1) {
                rootNodes.push(currentNode);
            }
            else {
                const parentLevel = task.level - 1;
                let parent;
                const currentIndex = sortedTasks.findIndex(t => t.activityId === task.activityId);
                for (let i = currentIndex - 1; i >= 0; i--) {
                    const candidateTask = sortedTasks[i];
                    if (candidateTask.level === parentLevel) {
                        parent = nodeMap.get(candidateTask.activityId);
                        break;
                    }
                    if (candidateTask.level < parentLevel) {
                        break;
                    }
                }
                if (parent) {
                    currentNode.parent = parent;
                    parent.children.push(currentNode);
                }
                else {
                    rootNodes.push(currentNode);
                }
            }
        }
        return rootNodes;
    }
    generateWbsCodes(nodes, parentCode = '') {
        let counter = 1;
        for (const node of nodes) {
            if (parentCode) {
                node.wbsCode = `${parentCode}.${counter}`;
            }
            else {
                node.wbsCode = `${counter}`;
            }
            if (node.children.length > 0) {
                this.generateWbsCodes(node.children, node.wbsCode);
            }
            counter++;
        }
    }
    async createTasksFromTree(nodes, projectId) {
        const createdTasks = [];
        await this.ensureProjectRoot(projectId);
        for (const node of nodes) {
            const tasks = await this.createNodeAndChildren(node, projectId, null);
            createdTasks.push(...tasks);
        }
        return createdTasks;
    }
    async createNodeAndChildren(node, projectId, parentId) {
        const createdTasks = [];
        const { resourceRole, resourceQty, roleHours } = this.parseResourceInfo(node.originalRow.resourcing, node.level);
        let startDate;
        let endDate;
        try {
            if (node.originalRow.startDate && node.originalRow.startDate.trim() !== '') {
                startDate = new Date(node.originalRow.startDate);
                if (isNaN(startDate.getTime())) {
                    console.warn(`Invalid start date "${node.originalRow.startDate}" for task ${node.activityId}, using current date`);
                    startDate = new Date();
                }
            }
            else {
                startDate = new Date();
            }
            if (node.originalRow.finishDate && node.originalRow.finishDate.trim() !== '') {
                endDate = new Date(node.originalRow.finishDate);
                if (isNaN(endDate.getTime())) {
                    console.warn(`Invalid finish date "${node.originalRow.finishDate}" for task ${node.activityId}, calculating from duration`);
                    endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + (node.originalRow.duration || 1));
                }
            }
            else if (node.originalRow.duration && node.originalRow.duration > 0) {
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + node.originalRow.duration - 1);
            }
            else {
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
            }
            if (endDate < startDate) {
                console.warn(`End date before start date for task ${node.activityId}, adjusting`);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 1);
            }
        }
        catch (error) {
            console.error(`Error parsing dates for task ${node.activityId}:`, error);
            startDate = new Date();
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 1);
        }
        let activityId = node.activityId;
        if (!activityId || activityId.trim() === '') {
            activityId = await this.generateUniqueActivityId(projectId, node.level, node.wbsCode);
        }
        else {
            const existingTask = await this.prisma.task.findFirst({
                where: { activityId: activityId }
            });
            if (existingTask) {
                console.warn(`Activity ID ${activityId} already exists, generating new one`);
                activityId = await this.generateUniqueActivityId(projectId, node.level, node.wbsCode);
            }
        }
        try {
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
                    costLabor: new library_1.Decimal(node.originalRow.budget || 0),
                    costMaterial: new library_1.Decimal(0),
                    costOther: new library_1.Decimal(0),
                    totalCost: new library_1.Decimal(node.originalRow.budget || 0),
                    resourceRole: resourceRole,
                    resourceQty: resourceQty,
                    resourceUnit: resourceQty ? 'hours/day' : null,
                    roleHours: roleHours
                }
            });
            createdTasks.push(task);
            console.log(`Created task: ${task.activityId} - ${task.title} (Level ${task.level})`);
            for (const child of node.children) {
                const childTasks = await this.createNodeAndChildren(child, projectId, task.id);
                createdTasks.push(...childTasks);
            }
        }
        catch (error) {
            console.error(`Failed to create task ${activityId}:`, error);
            console.warn(`Skipping task ${activityId} due to creation error`);
        }
        return createdTasks;
    }
    parseResourceInfo(resourcing, level) {
        if (!resourcing || level < 4) {
            return { resourceRole: null, resourceQty: null, roleHours: null };
        }
        if (resourcing.includes(':') && resourcing.includes('h')) {
            const roleHours = {};
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
        }
        else {
            const match = resourcing.match(/(.+?)\s*[\(\s]+(\d+(?:\.\d+)?)/);
            if (match) {
                return {
                    resourceRole: match[1].trim(),
                    resourceQty: parseFloat(match[2]),
                    roleHours: null
                };
            }
            return {
                resourceRole: resourcing.trim(),
                resourceQty: 1.0,
                roleHours: null
            };
        }
    }
    async createTaskRelationships(tasks, createdTasks) {
        console.log('Creating task relationships...');
        const activityMap = new Map(createdTasks.map(task => [task.activityId, task]));
        for (const taskRow of tasks) {
            if (!taskRow.predecessors)
                continue;
            const currentTask = activityMap.get(taskRow.activityId);
            if (!currentTask)
                continue;
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
                            type: 'FS',
                            lag: 0
                        }
                    });
                    console.log(`Created relationship: ${predId} -> ${taskRow.activityId}`);
                }
                catch (error) {
                    console.warn(`Failed to create relationship ${predId} -> ${taskRow.activityId}:`, error);
                }
            }
        }
    }
    async ensureProjectRoot(projectId) {
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
                        costLabor: new library_1.Decimal(0),
                        costMaterial: new library_1.Decimal(0),
                        costOther: new library_1.Decimal(0),
                        totalCost: new library_1.Decimal(0)
                    }
                });
            }
        }
    }
    async generateUniqueActivityId(projectId, level, parentWbs) {
        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                let activityId;
                if (projectId && level !== undefined) {
                    const project = await this.prisma.project.findUnique({
                        where: { id: projectId },
                        select: { name: true }
                    });
                    if (project) {
                        const projectPrefix = project.name
                            .toUpperCase()
                            .replace(/[^A-Z]/g, '')
                            .substring(0, 3)
                            .padEnd(3, 'X');
                        let suffix;
                        if (level <= 2) {
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
                        }
                        else {
                            const parentTasks = await this.prisma.task.findMany({
                                where: {
                                    projectId,
                                    level: level - 1,
                                    activityId: { startsWith: projectPrefix }
                                },
                                select: { activityId: true, wbsCode: true }
                            });
                            const parentTask = parentTasks.find(t => parentWbs ? parentWbs.startsWith(t.wbsCode) : true) || parentTasks[0];
                            if (parentTask) {
                                const parentSuffix = parentTask.activityId.split('-').pop() || '100';
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
                            }
                            else {
                                suffix = `${(level * 100 + attempt + 1).toString().padStart(3, '0')}`;
                            }
                        }
                        activityId = `${projectPrefix}-${suffix}`;
                    }
                    else {
                        activityId = `TSK-${Date.now().toString().slice(-6)}-${attempt}`;
                    }
                }
                else {
                    activityId = `TSK-${Date.now().toString().slice(-6)}-${attempt}`;
                }
                const existingTask = await this.prisma.task.findFirst({
                    where: { activityId },
                    select: { id: true }
                });
                if (!existingTask) {
                    return activityId;
                }
            }
            catch (error) {
                console.warn(`Activity ID generation attempt ${attempt + 1} failed:`, error);
                if (attempt === maxRetries - 1) {
                    const prefix = projectId ? 'ERR' : 'TSK';
                    return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                }
            }
        }
        return `TSK-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    }
    async clearExistingTasks(projectId) {
        console.log('Clearing existing tasks for project:', projectId);
        await this.prisma.taskRelation.deleteMany({
            where: {
                OR: [
                    { predecessor: { projectId } },
                    { successor: { projectId } }
                ]
            }
        });
        await this.prisma.task.deleteMany({
            where: { projectId }
        });
    }
    async updateBudgetRollups(projectId) {
        console.log('Updating budget rollups...');
        const tasks = await this.prisma.task.findMany({
            where: { projectId },
            orderBy: { level: 'desc' }
        });
        const processedTasks = new Set();
        for (const task of tasks) {
            if (processedTasks.has(task.id))
                continue;
            const children = await this.prisma.task.findMany({
                where: { parentId: task.id },
                select: { totalCost: true }
            });
            if (children.length > 0) {
                const rollupCost = children.reduce((sum, child) => {
                    return sum.plus(new library_1.Decimal(child.totalCost.toString()));
                }, new library_1.Decimal(0));
                await this.prisma.task.update({
                    where: { id: task.id },
                    data: { totalCost: rollupCost }
                });
            }
            processedTasks.add(task.id);
        }
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
};
exports.ScheduleImportService = ScheduleImportService;
exports.ScheduleImportService = ScheduleImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ScheduleImportService);
//# sourceMappingURL=schedule-import.service.js.map