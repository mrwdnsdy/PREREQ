import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

@Module({
  providers: [TasksService, PrismaService, AuthService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {} 