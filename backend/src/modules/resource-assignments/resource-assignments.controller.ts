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
import { ResourceAssignmentsService } from './resource-assignments.service';
import { CreateMultiAssignmentDto } from './dto/create-multi-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tasks/:taskId/resources')
@UseGuards(JwtAuthGuard)
export class ResourceAssignmentsController {
  constructor(private readonly resourceAssignmentsService: ResourceAssignmentsService) {}

  @Post()
  createMultipleAssignments(
    @Param('taskId') taskId: string,
    @Body() createMultiAssignmentDto: CreateMultiAssignmentDto,
  ) {
    return this.resourceAssignmentsService.createMultipleAssignments(taskId, createMultiAssignmentDto);
  }

  @Get()
  findTaskAssignments(@Param('taskId') taskId: string) {
    return this.resourceAssignmentsService.findTaskAssignments(taskId);
  }

  @Get('available')
  getAvailableResources(
    @Param('taskId') taskId: string,
    @Query('typeId') typeId?: string,
  ) {
    return this.resourceAssignmentsService.getAvailableResources(taskId, typeId);
  }
}

@Controller('assignments')
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private readonly resourceAssignmentsService: ResourceAssignmentsService) {}

  @Get(':id')
  findOneAssignment(@Param('id') id: string) {
    return this.resourceAssignmentsService.findOneAssignment(id);
  }

  @Patch(':id')
  updateAssignment(
    @Param('id') id: string,
    @Body() updateAssignmentDto: UpdateAssignmentDto,
  ) {
    return this.resourceAssignmentsService.updateAssignment(id, updateAssignmentDto);
  }

  @Delete(':id')
  deleteAssignment(@Param('id') id: string) {
    return this.resourceAssignmentsService.deleteAssignment(id);
  }
} 