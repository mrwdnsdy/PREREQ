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
exports.ResourcesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ResourcesService = class ResourcesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createResourceType(createResourceTypeDto) {
        try {
            return await this.prisma.resourceType.create({
                data: createResourceTypeDto,
                include: {
                    resources: true,
                },
            });
        }
        catch (error) {
            if (error.code === 'P2002') {
                throw new common_1.ConflictException('Resource type with this name already exists');
            }
            throw error;
        }
    }
    async findAllResourceTypes() {
        return await this.prisma.resourceType.findMany({
            include: {
                resources: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }
    async findOneResourceType(id) {
        const resourceType = await this.prisma.resourceType.findUnique({
            where: { id },
            include: {
                resources: true,
            },
        });
        if (!resourceType) {
            throw new common_1.NotFoundException('Resource type not found');
        }
        return resourceType;
    }
    async deleteResourceType(id) {
        const resourceType = await this.prisma.resourceType.findUnique({
            where: { id },
            include: {
                resources: true,
            },
        });
        if (!resourceType) {
            throw new common_1.NotFoundException('Resource type not found');
        }
        if (resourceType.resources.length > 0) {
            throw new common_1.ConflictException('Cannot delete resource type with existing resources');
        }
        return await this.prisma.resourceType.delete({
            where: { id },
        });
    }
    async createResource(createResourceDto) {
        const resourceType = await this.prisma.resourceType.findUnique({
            where: { id: createResourceDto.typeId },
        });
        if (!resourceType) {
            throw new common_1.NotFoundException('Resource type not found');
        }
        return await this.prisma.resource.create({
            data: createResourceDto,
            include: {
                type: true,
                assignments: true,
            },
        });
    }
    async findAllResources(typeId) {
        const where = typeId ? { typeId } : {};
        return await this.prisma.resource.findMany({
            where,
            include: {
                type: true,
                assignments: {
                    include: {
                        task: {
                            select: {
                                id: true,
                                title: true,
                                activityId: true,
                                wbsCode: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { type: { name: 'asc' } },
                { name: 'asc' },
            ],
        });
    }
    async findOneResource(id) {
        const resource = await this.prisma.resource.findUnique({
            where: { id },
            include: {
                type: true,
                assignments: {
                    include: {
                        task: {
                            select: {
                                id: true,
                                title: true,
                                activityId: true,
                                wbsCode: true,
                            },
                        },
                    },
                },
            },
        });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        return resource;
    }
    async updateResource(id, updateResourceDto) {
        const resource = await this.prisma.resource.findUnique({
            where: { id },
        });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        if (updateResourceDto.typeId) {
            const resourceType = await this.prisma.resourceType.findUnique({
                where: { id: updateResourceDto.typeId },
            });
            if (!resourceType) {
                throw new common_1.NotFoundException('Resource type not found');
            }
        }
        return await this.prisma.resource.update({
            where: { id },
            data: updateResourceDto,
            include: {
                type: true,
                assignments: true,
            },
        });
    }
    async deleteResource(id) {
        const resource = await this.prisma.resource.findUnique({
            where: { id },
            include: {
                assignments: true,
            },
        });
        if (!resource) {
            throw new common_1.NotFoundException('Resource not found');
        }
        if (resource.assignments.length > 0) {
            throw new common_1.ConflictException('Cannot delete resource with existing assignments');
        }
        return await this.prisma.resource.delete({
            where: { id },
        });
    }
};
exports.ResourcesService = ResourcesService;
exports.ResourcesService = ResourcesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ResourcesService);
//# sourceMappingURL=resources.service.js.map