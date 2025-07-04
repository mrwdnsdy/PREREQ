import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ScheduleImportService } from './schedule-import.service';
import { TasksController } from './tasks.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [TasksService, ScheduleImportService, PrismaService],
  controllers: [TasksController],
  exports: [TasksService, ScheduleImportService],
})
export class TasksModule {} 