import { Module } from '@nestjs/common';
import { P6ImportService } from './p6-import.service';
import { P6ImportController } from './p6-import.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AuthModule, TasksModule],
  providers: [P6ImportService, PrismaService],
  controllers: [P6ImportController],
  exports: [P6ImportService],
})
export class P6ImportModule {} 