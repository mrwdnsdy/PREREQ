import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { CreateResourceTypeDto } from './dto/create-resource-type.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('resources')
@UseGuards(JwtAuthGuard)
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  // Resource Types endpoints
  @Post('types')
  createResourceType(@Body() createResourceTypeDto: CreateResourceTypeDto) {
    return this.resourcesService.createResourceType(createResourceTypeDto);
  }

  @Get('types')
  findAllResourceTypes() {
    return this.resourcesService.findAllResourceTypes();
  }

  @Get('types/:id')
  findOneResourceType(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findOneResourceType(id);
  }

  @Delete('types/:id')
  deleteResourceType(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.deleteResourceType(id);
  }

  // Resources endpoints
  @Post()
  createResource(@Body() createResourceDto: CreateResourceDto) {
    return this.resourcesService.createResource(createResourceDto);
  }

  @Get()
  findAllResources(@Query('typeId') typeId?: string) {
    return this.resourcesService.findAllResources(typeId);
  }

  @Get(':id')
  findOneResource(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findOneResource(id);
  }

  @Patch(':id')
  updateResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateResourceDto: UpdateResourceDto,
  ) {
    return this.resourcesService.updateResource(id, updateResourceDto);
  }

  @Delete(':id')
  deleteResource(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.deleteResource(id);
  }
} 