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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const library_1 = require("@prisma/client/runtime/library");
let TasksService = class TasksService {
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async generateUniqueActivityId(projectId, _level) {
        if (!projectId) {
            return `A${Date.now().toString().slice(-4)}`;
        }
        const lastTask = await this.prisma.task.findFirst({
            where: {
                projectId,
                activityId: {
                    startsWith: 'A',
                    mode: 'insensitive',
                },
            },
            orderBy: {
                activityId: 'desc',
            },
            select: {
                activityId: true,
            },
        });
        let nextNumber = 1;
        if (lastTask?.activityId) {
            const numericPart = parseInt(lastTask.activityId.replace(/[^0-9]/g, ''), 10);
            if (!isNaN(numericPart)) {
                nextNumber = numericPart + 1;
            }
        }
        const padded = nextNumber.toString().padStart(4, '0');
        return `A${padded}`;
    }
    calculateLevel(parentId, projectId) {
        if (!parentId)
            return Promise.resolve(0);
        return this.prisma.task.findUnique({
            where: { id: parentId },
            select: { level: true },
        }).then(parent => {
            if (!parent)
                throw new common_1.BadRequestException('Parent task not found');
            if (parent.level >= 10)
                throw new common_1.BadRequestException('Cannot create tasks deeper than level 10');
            return parent.level + 1;
        });
    }
    async validateWbsHierarchy(parentId, projectId, desiredLevel) {
        if (!parentId) {
            const existingLevel0 = await this.prisma.task.findFirst({
                where: {
                    projectId: projectId,
                    level: 0,
                },
            });
            if (existingLevel0 && (!desiredLevel || desiredLevel === 0)) {
                throw new common_1.BadRequestException('Project already has a root-level WBS task (Level 0). Only one Level 0 task is allowed per project.');
            }
            return;
        }
        const parent = await this.prisma.task.findFirst({
            where: {
                id: parentId,
                projectId: projectId,
            },
            select: { level: true },
        });
        if (!parent) {
            throw new common_1.BadRequestException('Parent task not found');
        }
        const childLevel = parent.level + 1;
        if (desiredLevel && desiredLevel !== childLevel) {
            throw new common_1.BadRequestException(`Invalid WBS level. Task with parent at level ${parent.level} must be at level ${childLevel}, but level ${desiredLevel} was specified.`);
        }
        if (parent.level !== childLevel - 1) {
            throw new common_1.BadRequestException(`Invalid parent relationship. Parent task is at level ${parent.level}, but child would be at level ${childLevel}.`);
        }
    }
    async generateUniqueWbsCode(projectId, parentId) {
        if (!parentId) {
            const rootTasks = await this.prisma.task.findMany({
                where: {
                    projectId,
                    parentId: null,
                    level: { gte: 1 }
                },
                select: { wbsCode: true },
                orderBy: { wbsCode: 'desc' }
            });
            let maxRoot = 0;
            for (const task of rootTasks) {
                const firstPart = parseInt(task.wbsCode.split('.')[0]);
                if (!isNaN(firstPart) && firstPart > maxRoot) {
                    maxRoot = firstPart;
                }
            }
            return `${maxRoot + 1}`;
        }
        const parent = await this.prisma.task.findUnique({
            where: { id: parentId },
            select: { wbsCode: true }
        });
        if (!parent) {
            throw new common_1.BadRequestException('Parent task not found');
        }
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
    async validateWbsCodeUniqueness(projectId, wbsCode, excludeTaskId) {
        const existingTask = await this.prisma.task.findFirst({
            where: {
                projectId,
                wbsCode,
                ...(excludeTaskId && { id: { not: excludeTaskId } })
            },
            select: { id: true, title: true }
        });
        if (existingTask) {
            throw new common_1.BadRequestException(`WBS code "${wbsCode}" already exists in this project (used by task: "${existingTask.title}"). WBS codes must be unique within a project.`);
        }
    }
    calculateDirectCost(costLabor, costMaterial, costOther, roleHours) {
        let laborCost = new library_1.Decimal(costLabor || 0);
        if (roleHours && Object.keys(roleHours).length > 0) {
            laborCost = this.calculateLaborCostFromRoleHours(roleHours);
        }
        return laborCost
            .plus(new library_1.Decimal(costMaterial || 0))
            .plus(new library_1.Decimal(costOther || 0));
    }
    calculateLaborCostFromRoleHours(roleHours) {
        const hourlyRates = {
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
        const defaultRate = 125;
        let totalCost = new library_1.Decimal(0);
        for (const [role, hours] of Object.entries(roleHours)) {
            const rate = hourlyRates[role] || defaultRate;
            const roleCost = new library_1.Decimal(hours).times(new library_1.Decimal(rate));
            totalCost = totalCost.plus(roleCost);
        }
        return totalCost;
    }
    async updateBudgetRollups(taskId, visitedTasks = new Set()) {
        if (visitedTasks.has(taskId)) {
            console.warn(`Circular reference detected in task hierarchy: ${taskId}`);
            return;
        }
        visitedTasks.add(taskId);
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: {
                children: true,
                parent: true,
            },
        });
        if (!task)
            return;
        if (task.children.length > 0) {
            for (const child of task.children) {
                await this.updateBudgetRollups(child.id, new Set(visitedTasks));
            }
        }
        let totalCost = new library_1.Decimal(0);
        if (task.children.length === 0) {
            totalCost = this.calculateDirectCost(Number(task.costLabor), Number(task.costMaterial), Number(task.costOther));
        }
        else {
            const childTotals = await this.prisma.task.findMany({
                where: { parentId: taskId },
                select: { totalCost: true },
            });
            totalCost = childTotals.reduce((sum, child) => sum.plus(new library_1.Decimal(child.totalCost.toString())), new library_1.Decimal(0));
        }
        const currentTotalCost = new library_1.Decimal(task.totalCost.toString());
        if (!totalCost.equals(currentTotalCost)) {
            await this.prisma.task.update({
                where: { id: taskId },
                data: { totalCost },
            });
            if (task.level === 0) {
                await this.prisma.project.update({
                    where: { id: task.projectId },
                    data: { budgetRollup: totalCost },
                });
            }
            if (task.parentId) {
                await this.updateBudgetRollups(task.parentId, new Set(visitedTasks));
            }
        }
    }
    async ensureProjectRootTask(projectId) {
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
                        costLabor: new library_1.Decimal(0),
                        costMaterial: new library_1.Decimal(0),
                        costOther: new library_1.Decimal(0),
                        totalCost: new library_1.Decimal(0),
                    },
                });
            }
        }
    }
    async create(createTaskDto, userId) {
        console.log('TasksService.create called with DTO:', createTaskDto);
        const hasAccess = await this.authService.hasProjectAccess(userId, createTaskDto.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        await this.ensureProjectRootTask(createTaskDto.projectId);
        const level = await this.calculateLevel(createTaskDto.parentId, createTaskDto.projectId);
        await this.validateWbsHierarchy(createTaskDto.parentId, createTaskDto.projectId, level);
        if (createTaskDto.parentId) {
            const parent = await this.prisma.task.findFirst({
                where: {
                    id: createTaskDto.parentId,
                    projectId: createTaskDto.projectId,
                },
            });
            if (!parent) {
                throw new common_1.BadRequestException('Parent task must be in the same project');
            }
        }
        let wbsCode;
        if (createTaskDto.wbsCode) {
            await this.validateWbsCodeUniqueness(createTaskDto.projectId, createTaskDto.wbsCode);
            wbsCode = createTaskDto.wbsCode;
        }
        else {
            wbsCode = await this.generateUniqueWbsCode(createTaskDto.projectId, createTaskDto.parentId);
        }
        const activityId = await this.generateUniqueActivityId(createTaskDto.projectId, level);
        const directCost = this.calculateDirectCost(createTaskDto.costLabor || 0, createTaskDto.costMaterial || 0, createTaskDto.costOther || 0, level >= 4 ? createTaskDto.roleHours : undefined);
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
            wbsCode,
            activityId,
            level,
            startDate: new Date(createTaskDto.startDate),
            endDate: new Date(createTaskDto.endDate),
            costLabor: new library_1.Decimal(createTaskDto.costLabor || 0),
            costMaterial: new library_1.Decimal(createTaskDto.costMaterial || 0),
            costOther: new library_1.Decimal(createTaskDto.costOther || 0),
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
        await this.updateBudgetRollups(task.id);
        return task;
    }
    async findAll(projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
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
    async findOne(id, userId) {
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
            throw new common_1.NotFoundException('Task not found');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        return task;
    }
    async update(id, updateTaskDto, userId) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: { project: true },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        let level = task.level;
        if (updateTaskDto.parentId !== undefined && updateTaskDto.parentId !== task.parentId) {
            level = await this.calculateLevel(updateTaskDto.parentId, task.projectId);
            await this.validateWbsHierarchy(updateTaskDto.parentId, task.projectId, level);
        }
        if (updateTaskDto.wbsCode && updateTaskDto.wbsCode !== task.wbsCode) {
            await this.validateWbsCodeUniqueness(task.projectId, updateTaskDto.wbsCode, task.id);
        }
        const updatedCostLabor = updateTaskDto.costLabor !== undefined ? updateTaskDto.costLabor : Number(task.costLabor);
        const updatedCostMaterial = updateTaskDto.costMaterial !== undefined ? updateTaskDto.costMaterial : Number(task.costMaterial);
        const updatedCostOther = updateTaskDto.costOther !== undefined ? updateTaskDto.costOther : Number(task.costOther);
        const newDirectCost = this.calculateDirectCost(updatedCostLabor, updatedCostMaterial, updatedCostOther, level >= 4 ? updateTaskDto.roleHours : undefined);
        const updatedTask = await this.prisma.task.update({
            where: { id },
            data: {
                ...updateTaskDto,
                level,
                ...(updateTaskDto.startDate && { startDate: new Date(updateTaskDto.startDate) }),
                ...(updateTaskDto.endDate && { endDate: new Date(updateTaskDto.endDate) }),
                ...(updateTaskDto.costLabor !== undefined && { costLabor: new library_1.Decimal(updateTaskDto.costLabor) }),
                ...(updateTaskDto.costMaterial !== undefined && { costMaterial: new library_1.Decimal(updateTaskDto.costMaterial) }),
                ...(updateTaskDto.costOther !== undefined && { costOther: new library_1.Decimal(updateTaskDto.costOther) }),
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
        await this.updateBudgetRollups(updatedTask.id);
        return updatedTask;
    }
    async remove(id, userId) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: { project: true },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        if (task.level === 0) {
            throw new common_1.BadRequestException('Cannot delete the project root task (Level 0)');
        }
        const childrenCount = await this.prisma.task.count({
            where: { parentId: id },
        });
        if (childrenCount > 0) {
            throw new common_1.BadRequestException('Cannot delete task with children. Delete children first.');
        }
        const parentId = task.parentId;
        await this.prisma.task.delete({
            where: { id },
        });
        if (parentId) {
            await this.updateBudgetRollups(parentId);
        }
        return { message: 'Task deleted successfully' };
    }
    async getWbsTree(projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
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
        const taskMap = new Map();
        const rootTasks = [];
        tasks.forEach(task => {
            taskMap.set(task.id, { ...task, children: [] });
        });
        tasks.forEach(task => {
            if (task.parentId) {
                const parent = taskMap.get(task.parentId);
                if (parent) {
                    parent.children.push(taskMap.get(task.id));
                }
            }
            else {
                rootTasks.push(taskMap.get(task.id));
            }
        });
        return rootTasks;
    }
    async getMilestones(projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
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
    async recalculateProjectBudgets(projectId, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
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
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map