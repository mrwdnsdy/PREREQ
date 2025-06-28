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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  create(@Body() createProjectDto: CreateProjectDto, @Request() req) {
    return this.projectsService.create(createProjectDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of projects' })
  findAll(@Request() req) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific project' })
  @ApiResponse({ status: 200, description: 'Project details' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto, @Request() req) {
    return this.projectsService.update(id, updateProjectDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string, @Request() req) {
    return this.projectsService.remove(id, req.user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a project' })
  @ApiResponse({ status: 201, description: 'Member added successfully' })
  addMember(
    @Param('id') projectId: string,
    @Body() body: { userId: string; role: 'ADMIN' | 'PM' | 'VIEWER' },
    @Request() req,
  ) {
    return this.projectsService.addMember(projectId, req.user.id, body.userId, body.role);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a project' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  removeMember(
    @Param('id') projectId: string,
    @Param('memberId') memberUserId: string,
    @Request() req,
  ) {
    return this.projectsService.removeMember(projectId, req.user.id, memberUserId);
  }
} 