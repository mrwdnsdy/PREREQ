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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TasksService } from './tasks.service';
import { ScheduleImportService } from './schedule-import.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ImportScheduleDto } from './dto/import-schedule.dto';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly scheduleImportService: ScheduleImportService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid WBS level or parent task' })
  create(@Body() createTaskDto: CreateTaskDto, @Request() req) {
    console.log('TasksController.create - Received DTO:', createTaskDto);
    console.log('TasksController.create - DTO title specifically:', createTaskDto.title);
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

  @Post('project/:projectId/import-schedule')
  @ApiOperation({ summary: 'Import schedule from traditional format' })
  @ApiResponse({ status: 201, description: 'Schedule imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid schedule data' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  importSchedule(
    @Param('projectId') projectId: string,
    @Body() importScheduleDto: ImportScheduleDto,
    @Request() req
  ) {
    // Ensure the projectId matches the DTO
    importScheduleDto.projectId = projectId;
    return this.scheduleImportService.importSchedule(importScheduleDto, req.user.id);
  }

  @Post('project/:projectId/import-schedule-csv')
  @ApiOperation({ summary: 'Import schedule from CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Schedule imported successfully from CSV' })
  @ApiResponse({ status: 400, description: 'Invalid CSV file' })
  @UseInterceptors(FileInterceptor('file'))
  async importScheduleFromCsv(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }

    // Parse CSV file
    const csvData = file.buffer.toString('utf-8');
    const tasks = this.parseCsvToTasks(csvData);

    const importDto: ImportScheduleDto = {
      projectId,
      tasks,
      options: {
        replaceExisting: false,
        generateWbsCodes: true,
        validateDependencies: true
      }
    };

    return this.scheduleImportService.importSchedule(importDto, req.user.id);
  }

  private parseCsvToTasks(csvData: string): any[] {
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const tasks = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const task: any = {};
      
      // Map CSV columns to task properties
      headers.forEach((header, index) => {
        const value = values[index];
        switch (header.toLowerCase()) {
          case 'level':
            task.level = parseInt(value) || 1;
            break;
          case 'activity id':
          case 'activityid':
            task.activityId = value;
            break;
          case 'activity description':
          case 'description':
          case 'task name':
            task.description = value;
            break;
          case 'type':
            task.type = value;
            break;
          case 'duration':
            task.duration = parseFloat(value) || 0;
            break;
          case 'start date':
          case 'startdate':
            task.startDate = value;
            break;
          case 'finish date':
          case 'finishdate':
          case 'end date':
            task.finishDate = value;
            break;
          case 'predecessor':
          case 'predecessors':
            task.predecessors = value;
            break;
          case 'resourcing':
          case 'resource':
            task.resourcing = value;
            break;
          case 'budget':
          case 'cost':
            task.budget = parseFloat(value) || 0;
            break;
          case 'notes':
          case 'comments':
            task.notes = value;
            break;
        }
      });
      
      if (task.activityId && task.description) {
        tasks.push(task);
      }
    }
    
    return tasks;
  }
} 