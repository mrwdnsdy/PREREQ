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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { UpdateDependencyDto } from './dto/update-dependency.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('dependencies')
@UseGuards(JwtAuthGuard)
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  /**
   * Create a new task dependency
   * POST /dependencies
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDependencyDto: CreateDependencyDto) {
    return this.dependenciesService.create(createDependencyDto);
  }

  /**
   * Get all dependencies, optionally filtered by project
   * GET /dependencies?projectId=xxx
   */
  @Get()
  async findAll(@Query('projectId') projectId?: string) {
    return this.dependenciesService.findAll(projectId);
  }

  /**
   * Get dependencies for a specific task
   * GET /dependencies/task/:taskId
   */
  @Get('task/:taskId')
  async findByTaskId(@Param('taskId') taskId: string) {
    return this.dependenciesService.findByTaskId(taskId);
  }

  /**
   * Get a specific dependency by ID
   * GET /dependencies/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.dependenciesService.findOne(id);
  }

  /**
   * Update a dependency (only type and lag)
   * PATCH /dependencies/:id
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDependencyDto: UpdateDependencyDto,
  ) {
    return this.dependenciesService.update(id, updateDependencyDto);
  }

  /**
   * Delete a dependency
   * DELETE /dependencies/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.dependenciesService.remove(id);
  }
} 