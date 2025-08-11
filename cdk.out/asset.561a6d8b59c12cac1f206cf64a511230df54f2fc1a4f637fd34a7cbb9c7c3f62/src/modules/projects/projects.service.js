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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const auth_service_1 = require("../auth/auth.service");
const library_1 = require("@prisma/client/runtime/library");
let ProjectsService = class ProjectsService {
    constructor(prisma, authService) {
        this.prisma = prisma;
        this.authService = authService;
    }
    async generateUniqueActivityId(projectName) {
        const maxRetries = 5;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                let activityId;
                if (projectName) {
                    const projectPrefix = projectName
                        .toUpperCase()
                        .replace(/[^A-Z]/g, '')
                        .substring(0, 3)
                        .padEnd(3, 'X');
                    activityId = `${projectPrefix}-000`;
                    let counter = 0;
                    while (counter < 999) {
                        const testId = `${projectPrefix}-${counter.toString().padStart(3, '0')}`;
                        const existingTask = await this.prisma.task.findFirst({
                            where: { activityId: testId },
                            select: { id: true }
                        });
                        if (!existingTask) {
                            activityId = testId;
                            break;
                        }
                        counter++;
                    }
                }
                else {
                    activityId = `ROOT-${Date.now().toString().slice(-6)}-${attempt}`;
                }
                const existingTask = await this.prisma.task.findFirst({
                    where: { activityId },
                    select: { id: true }
                });
                if (!existingTask) {
                    return activityId;
                }
                if (attempt === maxRetries - 1) {
                    return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                }
            }
            catch (error) {
                console.warn(`Activity ID generation attempt ${attempt + 1} failed:`, error);
                if (attempt === maxRetries - 1) {
                    return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
                }
            }
        }
        return `ROOT-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    }
    async create(createProjectDto, userId) {
        const project = await this.prisma.project.create({
            data: {
                ...createProjectDto,
                startDate: new Date(createProjectDto.startDate),
                endDate: new Date(createProjectDto.endDate),
                budget: createProjectDto.budget ? new library_1.Decimal(createProjectDto.budget) : null,
                budgetRollup: new library_1.Decimal(0),
            },
        });
        await this.prisma.projectMember.create({
            data: {
                userId,
                projectId: project.id,
                role: 'ADMIN',
            },
        });
        const activityId = await this.generateUniqueActivityId(project.name);
        await this.prisma.task.create({
            data: {
                activityId,
                projectId: project.id,
                level: 0,
                wbsCode: '0',
                title: `${project.name} (Project Root)`,
                description: 'Project root-level WBS element - all project work rolls up to this level',
                startDate: project.startDate,
                endDate: project.endDate,
                isMilestone: false,
                costLabor: new library_1.Decimal(0),
                costMaterial: new library_1.Decimal(0),
                costOther: new library_1.Decimal(0),
                totalCost: new library_1.Decimal(0),
            },
        });
        return project;
    }
    async findAll(userId) {
        return this.prisma.project.findMany({
            where: {
                members: {
                    some: {
                        userId,
                    },
                },
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        tasks: true,
                    },
                },
            },
        });
    }
    async findOne(id, userId) {
        const project = await this.prisma.project.findFirst({
            where: {
                id,
                members: {
                    some: {
                        userId,
                    },
                },
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                email: true,
                                fullName: true,
                            },
                        },
                    },
                },
                tasks: {
                    include: {
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
                        children: true,
                    },
                    orderBy: [
                        { level: 'asc' },
                        { wbsCode: 'asc' },
                    ],
                },
            },
        });
        if (!project) {
            throw new common_1.NotFoundException('Project not found');
        }
        return project;
    }
    async update(id, updateProjectDto, userId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, id, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        const project = await this.prisma.project.update({
            where: { id },
            data: {
                ...updateProjectDto,
                ...(updateProjectDto.startDate && { startDate: new Date(updateProjectDto.startDate) }),
                ...(updateProjectDto.endDate && { endDate: new Date(updateProjectDto.endDate) }),
                ...(updateProjectDto.budget !== undefined && {
                    budget: updateProjectDto.budget ? new library_1.Decimal(updateProjectDto.budget) : null
                }),
            },
        });
        return project;
    }
    async getUserProjectRole(userId, projectId) {
        return this.prisma.projectMember.findFirst({
            where: {
                userId,
                projectId,
            },
            select: {
                role: true,
            },
        });
    }
    async remove(id) {
        return await this.prisma.$transaction(async (prisma) => {
            await prisma.taskRelation.deleteMany({
                where: {
                    OR: [
                        { predecessor: { projectId: id } },
                        { successor: { projectId: id } },
                    ],
                },
            });
            await prisma.task.deleteMany({
                where: { projectId: id },
            });
            await prisma.projectMember.deleteMany({
                where: { projectId: id },
            });
            const deletedProject = await prisma.project.delete({
                where: { id },
            });
            return {
                message: 'Project and all related data deleted successfully',
                deletedProject
            };
        });
    }
    async addMember(projectId, userId, memberUserId, role) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        return this.prisma.projectMember.create({
            data: {
                userId: memberUserId,
                projectId,
                role,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                    },
                },
            },
        });
    }
    async removeMember(projectId, userId, memberUserId) {
        const hasAccess = await this.authService.hasProjectAccess(userId, projectId, 'PM');
        if (!hasAccess) {
            throw new common_1.ForbiddenException('Insufficient permissions');
        }
        await this.prisma.projectMember.delete({
            where: {
                userId_projectId: {
                    userId: memberUserId,
                    projectId,
                },
            },
        });
        return { message: 'Member removed successfully' };
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        auth_service_1.AuthService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map