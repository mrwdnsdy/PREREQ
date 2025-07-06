import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateResourceTypeDto } from './dto/create-resource-type.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

@Injectable()
export class ResourcesService {
  constructor(private prisma: PrismaService) {}

  // Resource Types
  async createResourceType(createResourceTypeDto: CreateResourceTypeDto) {
    try {
      return await this.prisma.resourceType.create({
        data: createResourceTypeDto,
        include: {
          resources: true,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException('Resource type with this name already exists');
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

  async findOneResourceType(id: string) {
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { id },
      include: {
        resources: true,
      },
    });

    if (!resourceType) {
      throw new NotFoundException('Resource type not found');
    }

    return resourceType;
  }

  async deleteResourceType(id: string) {
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { id },
      include: {
        resources: true,
      },
    });

    if (!resourceType) {
      throw new NotFoundException('Resource type not found');
    }

    if (resourceType.resources.length > 0) {
      throw new ConflictException('Cannot delete resource type with existing resources');
    }

    return await this.prisma.resourceType.delete({
      where: { id },
    });
  }

  // Resources
  async createResource(createResourceDto: CreateResourceDto) {
    // Verify resource type exists
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { id: createResourceDto.typeId },
    });

    if (!resourceType) {
      throw new NotFoundException('Resource type not found');
    }

    return await this.prisma.resource.create({
      data: createResourceDto,
      include: {
        type: true,
        assignments: true,
      },
    });
  }

  async findAllResources(typeId?: string) {
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

  async findOneResource(id: string) {
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
      throw new NotFoundException('Resource not found');
    }

    return resource;
  }

  async updateResource(id: string, updateResourceDto: UpdateResourceDto) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    // If typeId is being updated, verify the new type exists
    if (updateResourceDto.typeId) {
      const resourceType = await this.prisma.resourceType.findUnique({
        where: { id: updateResourceDto.typeId },
      });

      if (!resourceType) {
        throw new NotFoundException('Resource type not found');
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

  async deleteResource(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: {
        assignments: true,
      },
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    if (resource.assignments.length > 0) {
      throw new ConflictException('Cannot delete resource with existing assignments');
    }

    return await this.prisma.resource.delete({
      where: { id },
    });
  }
} 