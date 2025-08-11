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
exports.DependenciesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let DependenciesService = class DependenciesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createDependencyDto) {
        const { predecessorId, successorId, type, lag } = createDependencyDto;
        if (predecessorId === successorId) {
            throw new common_1.BadRequestException('Successor task cannot be the same as predecessor task (self-link not allowed)');
        }
        await this.validateTasksExist(predecessorId, successorId);
        await this.checkForDuplicate(predecessorId, successorId);
        await this.checkForImmediateCircularReference(predecessorId, successorId);
        try {
            return await this.prisma.taskDependency.create({
                data: {
                    predecessorId,
                    successorId,
                    type,
                    lag: lag ?? 0,
                },
                include: {
                    predecessor: {
                        select: { id: true, title: true, wbsCode: true }
                    },
                    successor: {
                        select: { id: true, title: true, wbsCode: true }
                    }
                }
            });
        }
        catch (error) {
            if (error.code === 'P2002') {
                throw new common_1.ConflictException('A dependency between these tasks already exists');
            }
            throw error;
        }
    }
    async findAll(projectId) {
        const whereClause = projectId ? {
            predecessor: { projectId },
            successor: { projectId }
        } : {};
        return this.prisma.taskDependency.findMany({
            where: whereClause,
            include: {
                predecessor: {
                    select: { id: true, title: true, wbsCode: true, projectId: true }
                },
                successor: {
                    select: { id: true, title: true, wbsCode: true, projectId: true }
                }
            },
            orderBy: [
                { predecessor: { wbsCode: 'asc' } },
                { successor: { wbsCode: 'asc' } }
            ]
        });
    }
    async findByTaskId(taskId) {
        const [asPredecessor, asSuccessor] = await Promise.all([
            this.prisma.taskDependency.findMany({
                where: { predecessorId: taskId },
                include: {
                    successor: {
                        select: { id: true, title: true, wbsCode: true }
                    }
                }
            }),
            this.prisma.taskDependency.findMany({
                where: { successorId: taskId },
                include: {
                    predecessor: {
                        select: { id: true, title: true, wbsCode: true }
                    }
                }
            })
        ]);
        return { asPredecessor, asSuccessor };
    }
    async findOne(id) {
        const dependency = await this.prisma.taskDependency.findUnique({
            where: { id },
            include: {
                predecessor: {
                    select: { id: true, title: true, wbsCode: true }
                },
                successor: {
                    select: { id: true, title: true, wbsCode: true }
                }
            }
        });
        if (!dependency) {
            throw new common_1.NotFoundException(`Dependency with ID ${id} not found`);
        }
        return dependency;
    }
    async update(id, updateDependencyDto) {
        await this.findOne(id);
        return this.prisma.taskDependency.update({
            where: { id },
            data: updateDependencyDto,
            include: {
                predecessor: {
                    select: { id: true, title: true, wbsCode: true }
                },
                successor: {
                    select: { id: true, title: true, wbsCode: true }
                }
            }
        });
    }
    async remove(id) {
        await this.findOne(id);
        return this.prisma.taskDependency.delete({
            where: { id },
            include: {
                predecessor: {
                    select: { id: true, title: true, wbsCode: true }
                },
                successor: {
                    select: { id: true, title: true, wbsCode: true }
                }
            }
        });
    }
    async validateTasksExist(predecessorId, successorId) {
        const [predecessor, successor] = await Promise.all([
            this.prisma.task.findUnique({ where: { id: predecessorId } }),
            this.prisma.task.findUnique({ where: { id: successorId } })
        ]);
        if (!predecessor) {
            throw new common_1.BadRequestException(`Predecessor task with ID ${predecessorId} not found`);
        }
        if (!successor) {
            throw new common_1.BadRequestException(`Successor task with ID ${successorId} not found`);
        }
        if (predecessor.projectId !== successor.projectId) {
            throw new common_1.BadRequestException('Tasks must be in the same project to create a dependency');
        }
    }
    async checkForDuplicate(predecessorId, successorId) {
        const existingDependency = await this.prisma.taskDependency.findUnique({
            where: {
                predecessorId_successorId: {
                    predecessorId,
                    successorId
                }
            }
        });
        if (existingDependency) {
            throw new common_1.ConflictException(`A dependency already exists between these tasks`);
        }
    }
    async checkForImmediateCircularReference(predecessorId, successorId) {
        const reverseRelation = await this.prisma.taskDependency.findUnique({
            where: {
                predecessorId_successorId: {
                    predecessorId: successorId,
                    successorId: predecessorId
                }
            }
        });
        if (reverseRelation) {
            throw new common_1.BadRequestException('Cannot create dependency: this would create an immediate circular reference. ' +
                'A dependency already exists in the opposite direction between these tasks.');
        }
    }
};
exports.DependenciesService = DependenciesService;
exports.DependenciesService = DependenciesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DependenciesService);
//# sourceMappingURL=dependencies.service.js.map