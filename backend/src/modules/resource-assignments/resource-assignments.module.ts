import { Module } from '@nestjs/common';
import { ResourceAssignmentsService } from './resource-assignments.service';
import { ResourceAssignmentsController, AssignmentsController } from './resource-assignments.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ResourceAssignmentsController, AssignmentsController],
  providers: [ResourceAssignmentsService, PrismaService],
  exports: [ResourceAssignmentsService],
})
export class ResourceAssignmentsModule {} 