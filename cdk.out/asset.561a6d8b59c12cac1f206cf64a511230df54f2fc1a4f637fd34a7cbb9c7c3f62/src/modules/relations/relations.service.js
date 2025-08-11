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
exports.RelationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
let RelationsService = class RelationsService {
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async create(predecessorId, createRelationDto, userId) {
        const predecessor = await this.prisma.task.findUnique({
            where: { id: predecessorId },
            include: { project: true },
        });
        if (!predecessor) {
            throw new common_1.NotFoundException('Predecessor task not found');
        }
        const successor = await this.prisma.task.findUnique({
            where: { id: createRelationDto.successorId },
            include: { project: true },
        });
        if (!successor) {
            throw new common_1.NotFoundException('Successor task not found');
        }
        if (predecessor.projectId !== successor.projectId) {
            throw new common_1.BadRequestException('Tasks must be in the same project');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, predecessor.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions for this project');
        }
        if (predecessorId === createRelationDto.successorId) {
            throw new common_1.BadRequestException('Cannot create relationship to self');
        }
        const existingRelation = await this.prisma.taskRelation.findUnique({
            where: {
                predecessorId_successorId: {
                    predecessorId,
                    successorId: createRelationDto.successorId,
                },
            },
        });
        if (existingRelation) {
            throw new common_1.BadRequestException('Relationship already exists');
        }
        const hasCircularDependency = await this.checkCircularDependency(createRelationDto.successorId, predecessorId);
        if (hasCircularDependency) {
            throw new common_1.BadRequestException('Circular dependency detected');
        }
        const relation = await this.prisma.taskRelation.create({
            data: {
                predecessorId,
                successorId: createRelationDto.successorId,
                type: createRelationDto.type,
                lag: createRelationDto.lag,
            },
            include: {
                predecessor: true,
                successor: true,
            },
        });
        return relation;
    }
    async update(predecessorId, relationId, updateRelationDto, userId) {
        const relation = await this.prisma.taskRelation.findUnique({
            where: { id: relationId },
            include: {
                predecessor: {
                    include: { project: true },
                },
            },
        });
        if (!relation) {
            throw new common_1.NotFoundException('Relationship not found');
        }
        if (relation.predecessorId !== predecessorId) {
            throw new common_1.BadRequestException('Relationship does not belong to the specified predecessor');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, relation.predecessor.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const updatedRelation = await this.prisma.taskRelation.update({
            where: { id: relationId },
            data: {
                ...(updateRelationDto.type && { type: updateRelationDto.type }),
                ...(updateRelationDto.lag !== undefined && { lag: updateRelationDto.lag }),
            },
            include: {
                predecessor: true,
                successor: true,
            },
        });
        return updatedRelation;
    }
    async remove(predecessorId, relationId, userId) {
        const relation = await this.prisma.taskRelation.findUnique({
            where: { id: relationId },
            include: {
                predecessor: {
                    include: { project: true },
                },
            },
        });
        if (!relation) {
            throw new common_1.NotFoundException('Relationship not found');
        }
        if (relation.predecessorId !== predecessorId) {
            throw new common_1.BadRequestException('Relationship does not belong to the specified predecessor');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, relation.predecessor.projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        await this.prisma.taskRelation.delete({
            where: { id: relationId },
        });
        return { message: 'Relationship deleted successfully' };
    }
    async getTaskRelations(taskId, userId) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: { project: true },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const hasAccess = await this.authService.hasProjectAccess(userId, task.projectId, 'VIEWER');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const [predecessors, successors] = await Promise.all([
            this.prisma.taskRelation.findMany({
                where: { successorId: taskId },
                include: {
                    predecessor: true,
                },
            }),
            this.prisma.taskRelation.findMany({
                where: { predecessorId: taskId },
                include: {
                    successor: true,
                },
            }),
        ]);
        return {
            predecessors,
            successors,
        };
    }
    async checkCircularDependency(startTaskId, targetTaskId) {
        const visited = new Set();
        const queue = [startTaskId];
        while (queue.length > 0) {
            const currentTaskId = queue.shift();
            if (currentTaskId === targetTaskId) {
                return true;
            }
            if (visited.has(currentTaskId)) {
                continue;
            }
            visited.add(currentTaskId);
            const successors = await this.prisma.taskRelation.findMany({
                where: { predecessorId: currentTaskId },
                select: { successorId: true },
            });
            for (const successor of successors) {
                queue.push(successor.successorId);
            }
        }
        return false;
    }
};
exports.RelationsService = RelationsService;
exports.RelationsService = RelationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], RelationsService);
//# sourceMappingURL=relations.service.js.map