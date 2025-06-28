import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RelationsService } from './relations.service';
import { CreateRelationDto } from './dto/create-relation.dto';
import { UpdateRelationDto } from './dto/update-relation.dto';

@ApiTags('Task Relations')
@Controller('tasks/:taskId/relations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RelationsController {
  constructor(private readonly relationsService: RelationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task relationship' })
  @ApiResponse({ status: 201, description: 'Relationship created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid relationship or circular dependency' })
  create(
    @Param('taskId') taskId: string,
    @Body() createRelationDto: CreateRelationDto,
    @Request() req,
  ) {
    return this.relationsService.create(taskId, createRelationDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all relationships for a task' })
  @ApiResponse({ status: 200, description: 'Task relationships' })
  getTaskRelations(@Param('taskId') taskId: string, @Request() req) {
    return this.relationsService.getTaskRelations(taskId, req.user.id);
  }

  @Patch(':relationId')
  @ApiOperation({ summary: 'Update a task relationship' })
  @ApiResponse({ status: 200, description: 'Relationship updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(
    @Param('taskId') taskId: string,
    @Param('relationId') relationId: string,
    @Body() updateRelationDto: UpdateRelationDto,
    @Request() req,
  ) {
    return this.relationsService.update(taskId, relationId, updateRelationDto, req.user.id);
  }

  @Delete(':relationId')
  @ApiOperation({ summary: 'Delete a task relationship' })
  @ApiResponse({ status: 200, description: 'Relationship deleted successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(
    @Param('taskId') taskId: string,
    @Param('relationId') relationId: string,
    @Request() req,
  ) {
    return this.relationsService.remove(taskId, relationId, req.user.id);
  }
} 