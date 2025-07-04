import { Module } from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { DependenciesController } from './dependencies.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [DependenciesController],
  providers: [DependenciesService, PrismaService],
  exports: [DependenciesService],
})
export class DependenciesModule {} 