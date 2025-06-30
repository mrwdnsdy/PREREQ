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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid WBS level or parent task' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    return this.tasksService.create(createTaskDto, req.user.id);
  }

  @Get('project/:projectId')
  @ApiOperation({ summary: 'Get all tasks for a project' })
  @ApiResponse({ status: 200, description: 'List of tasks' })
  findAll(@Param('projectId') projectId: string, @Request() req) {
    return this.tasksService.findAll(projectId, req.user.id);
  }

  @Get('project/:projectId/wbs')
  @ApiOperation({ summary: 'Get WBS tree for a project' })
  @ApiResponse({ status: 200, description: 'WBS tree structure' })
  getWbsTree(@Param('projectId') projectId: string, @Request() req) {
    return this.tasksService.getWbsTree(projectId, req.user.id);
  }

  @Get('project/:projectId/milestones')
  @ApiOperation({ summary: 'Get milestones for a project' })
  @ApiResponse({ status: 200, description: 'List of milestones' })
  getMilestones(@Param('projectId') projectId: string, @Request() req) {
    return this.tasksService.getMilestones(projectId, req.user.id);
  }

  @Post('project/:projectId/recalculate-budgets')
  @ApiOperation({ summary: 'Recalculate budget rollups for a project' })
  @ApiResponse({ status: 200, description: 'Budget rollups recalculated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  recalculateBudgets(@Param('projectId') projectId: string, @Request() req) {
    return this.tasksService.recalculateProjectBudgets(projectId, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific task' })
  @ApiResponse({ status: 200, description: 'Task details' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.tasksService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @Request() req) {
    return this.tasksService.update(id, updateTaskDto, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete task with children' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string, @Request() req) {
    return this.tasksService.remove(id, req.user.id);
  }
} 