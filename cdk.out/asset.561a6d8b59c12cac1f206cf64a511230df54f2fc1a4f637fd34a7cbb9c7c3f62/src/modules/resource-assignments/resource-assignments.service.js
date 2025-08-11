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
exports.ResourceAssignmentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ResourceAssignmentsService = class ResourceAssignmentsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createMultipleAssignments(taskId, createMultiAssignmentDto) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const resourceIds = createMultiAssignmentDto.assignments.map(a => a.resourceId);
        const resources = await this.prisma.resource.findMany({
            where: { id: { in: resourceIds } },
        });
        if (resources.length !== resourceIds.length) {
            const foundIds = resources.map(r => r.id);
            const missingIds = resourceIds.filter(id => !foundIds.includes(id));
            throw new common_1.NotFoundException(`Resources not found: ${missingIds.join(', ')}`);
        }
        const existingAssignments = await this.prisma.resourceAssignment.findMany({
            where: {
                taskId,
                resourceId: { in: resourceIds },
            },
        });
        if (existingAssignments.length > 0) {
            const existingResourceIds = existingAssignments.map(a => a.resourceId);
            const duplicateResources = resources.filter(r => existingResourceIds.includes(r.id));
            throw new common_1.ConflictException(`Resources already assigned to this task: ${duplicateResources.map(r => r.name).join(', ')}`);
        }
        const assignments = createMultiAssignmentDto.assignments.map(assignment => ({
            taskId,
            resourceId: assignment.resourceId,
            hours: assignment.hours,
        }));
        const createdAssignments = await this.prisma.$transaction(assignments.map(assignment => this.prisma.resourceAssignment.create({
            data: assignment,
            include: {
                resource: {
                    include: {
                        type: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        activityId: true,
                        wbsCode: true,
                    },
                },
            },
        })));
        return createdAssignments;
    }
    async findTaskAssignments(taskId) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            select: {
                id: true,
                title: true,
                activityId: true,
                wbsCode: true,
            },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const assignments = await this.prisma.resourceAssignment.findMany({
            where: { taskId },
            include: {
                resource: {
                    include: {
                        type: true,
                    },
                },
            },
            orderBy: [
                { resource: { type: { name: 'asc' } } },
                { resource: { name: 'asc' } },
            ],
        });
        return {
            task,
            assignments,
        };
    }
    async findOneAssignment(id) {
        const assignment = await this.prisma.resourceAssignment.findUnique({
            where: { id },
            include: {
                resource: {
                    include: {
                        type: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        activityId: true,
                        wbsCode: true,
                    },
                },
            },
        });
        if (!assignment) {
            throw new common_1.NotFoundException('Assignment not found');
        }
        return assignment;
    }
    async updateAssignment(id, updateAssignmentDto) {
        const assignment = await this.prisma.resourceAssignment.findUnique({
            where: { id },
        });
        if (!assignment) {
            throw new common_1.NotFoundException('Assignment not found');
        }
        return await this.prisma.resourceAssignment.update({
            where: { id },
            data: updateAssignmentDto,
            include: {
                resource: {
                    include: {
                        type: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        title: true,
                        activityId: true,
                        wbsCode: true,
                    },
                },
            },
        });
    }
    async deleteAssignment(id) {
        const assignment = await this.prisma.resourceAssignment.findUnique({
            where: { id },
        });
        if (!assignment) {
            throw new common_1.NotFoundException('Assignment not found');
        }
        return await this.prisma.resourceAssignment.delete({
            where: { id },
        });
    }
    async getAvailableResources(taskId, typeId) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const assignedResourceIds = await this.prisma.resourceAssignment.findMany({
            where: { taskId },
            select: { resourceId: true },
        });
        const excludeResourceIds = assignedResourceIds.map(a => a.resourceId);
        const where = {
            id: { notIn: excludeResourceIds },
        };
        if (typeId) {
            where.typeId = typeId;
        }
        return await this.prisma.resource.findMany({
            where,
            include: {
                type: true,
            },
            orderBy: [
                { type: { name: 'asc' } },
                { name: 'asc' },
            ],
        });
    }
};
exports.ResourceAssignmentsService = ResourceAssignmentsService;
exports.ResourceAssignmentsService = ResourceAssignmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ResourceAssignmentsService);
//# sourceMappingURL=resource-assignments.service.js.map